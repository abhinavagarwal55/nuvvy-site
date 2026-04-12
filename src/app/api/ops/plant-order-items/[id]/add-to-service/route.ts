import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/plant-order-items/[id]/add-to-service — schedule install task
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Fetch the item and derive customer_id via plant_orders
  const { data: item, error: itemError } = await supabase
    .from("plant_order_items")
    .select("*, plant_orders(customer_id)")
    .eq("id", id)
    .single();

  if (itemError) {
    if (itemError.code === "PGRST116") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const order = item.plant_orders as unknown as {
    customer_id: string;
  } | null;

  if (!order?.customer_id) {
    return NextResponse.json(
      { error: "Could not determine customer for this item" },
      { status: 500 }
    );
  }

  // Item must be procured before scheduling installation
  if (item.status !== "procured") {
    return NextResponse.json(
      { error: `Cannot schedule installation: item status is '${item.status}', must be 'procured'` },
      { status: 409 }
    );
  }

  const customerId = order.customer_id;
  const today = new Date().toISOString().split("T")[0];

  // Find next scheduled visit for this customer
  const { data: visit, error: visitError } = await supabase
    .from("service_visits")
    .select("id, scheduled_date")
    .eq("customer_id", customerId)
    .eq("status", "scheduled")
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .limit(1)
    .single();

  if (visitError) {
    if (visitError.code === "PGRST116") {
      return NextResponse.json(
        { error: "No upcoming visit scheduled for this customer" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: visitError.message }, { status: 500 });
  }

  // Create service_special_tasks row
  const description = `Install: ${item.quantity}x ${item.plant_name}`;
  const { error: taskError } = await supabase
    .from("service_special_tasks")
    .insert({
      for_service_id: visit.id,
      description,
      is_completed: false,
      created_by: auth.userId,
    });

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  // Update item with install_service_id
  const { error: updateError } = await supabase
    .from("plant_order_items")
    .update({ install_service_id: visit.id })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order_item.install_scheduled",
    targetTable: "plant_order_items",
    targetId: id,
    metadata: {
      service_visit_id: visit.id,
      scheduled_date: visit.scheduled_date,
      description,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: {
      item_id: id,
      service_visit_id: visit.id,
      scheduled_date: visit.scheduled_date,
    },
  });
}
