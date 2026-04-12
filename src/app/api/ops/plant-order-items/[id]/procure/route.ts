import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/plant-order-items/[id]/procure — procurement closure
// ---------------------------------------------------------------------------
const ProcureSchema = z
  .object({
    qty_procured: z.number().int().min(1),
    actual_unit_price: z.number().min(0),
    procurement_date: z.string().min(1, "procurement_date is required"),
    nursery_name: z.string().optional(),
    balance_action: z.enum(["keep_pending", "cancel"]).optional(),
    balance_new_due_date: z.string().optional(),
    cancel_reason: z.string().optional(),
  })
  .refine(
    (data) => {
      // balance_action is validated after we know whether it's partial
      return true;
    },
    { message: "Validation passed" }
  );

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProcureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  // Fetch the item
  const { data: item, error: itemError } = await supabase
    .from("plant_order_items")
    .select("*")
    .eq("id", id)
    .single();

  if (itemError) {
    if (itemError.code === "PGRST116") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (item.status !== "trip_assigned" && item.status !== "procured") {
    return NextResponse.json(
      { error: `Item must be in 'trip_assigned' or 'procured' status to record procurement (current: '${item.status}')` },
      { status: 409 }
    );
  }

  if (d.qty_procured > item.quantity) {
    return NextResponse.json(
      { error: "qty_procured cannot exceed item quantity" },
      { status: 400 }
    );
  }

  const isPartial = d.qty_procured < item.quantity;

  if (isPartial && !d.balance_action) {
    return NextResponse.json(
      { error: "balance_action is required for partial procurement" },
      { status: 400 }
    );
  }

  // Update the original item as procured
  const { error: updateError } = await supabase
    .from("plant_order_items")
    .update({
      qty_procured: d.qty_procured,
      actual_unit_price: d.actual_unit_price,
      procurement_date: d.procurement_date,
      nursery_name: d.nursery_name ?? item.nursery_name ?? null,
      status: "procured",
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Handle partial procurement — create a new row for the remainder
  if (isPartial) {
    const remainingQty = item.quantity - d.qty_procured;

    if (d.balance_action === "keep_pending") {
      const { error: insertError } = await supabase
        .from("plant_order_items")
        .insert({
          plant_order_id: item.plant_order_id,
          plant_id: item.plant_id,
          plant_name: item.plant_name,
          quantity: remainingQty,
          note: item.note,
          status: "requested",
        });

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    } else if (d.balance_action === "cancel") {
      const { error: insertError } = await supabase
        .from("plant_order_items")
        .insert({
          plant_order_id: item.plant_order_id,
          plant_id: item.plant_id,
          plant_name: item.plant_name,
          quantity: remainingQty,
          note: item.note,
          status: "cancelled",
          cancellation_reason: d.cancel_reason ?? "Partial procurement — remainder cancelled",
        });

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }
  }

  // Insert into procurement_price_log
  const { error: logError } = await supabase
    .from("procurement_price_log")
    .insert({
      plant_id: item.plant_id,
      plant_name: item.plant_name,
      unit_price: d.actual_unit_price,
      nursery_name: d.nursery_name ?? null,
      plant_order_item_id: id,
    });

  if (logError) {
    // Non-critical — log but don't fail the request
    console.error("Failed to insert procurement_price_log:", logError.message);
  }

  // Check if ALL items for this order are now procured (or beyond)
  const { data: orderItems } = await supabase
    .from("plant_order_items")
    .select("id, status")
    .eq("plant_order_id", item.plant_order_id);

  if (orderItems) {
    const allProcuredOrBeyond = orderItems.every((oi) =>
      ["procured", "installed", "cancelled"].includes(oi.status)
    );
    if (allProcuredOrBeyond) {
      await supabase
        .from("plant_orders")
        .update({ status: "procured" })
        .eq("id", item.plant_order_id);
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order_item.procured",
    targetTable: "plant_order_items",
    targetId: id,
    metadata: {
      qty_procured: d.qty_procured,
      actual_unit_price: d.actual_unit_price,
      is_partial: isPartial,
      balance_action: d.balance_action,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { id, status: "procured", qty_procured: d.qty_procured },
  });
}
