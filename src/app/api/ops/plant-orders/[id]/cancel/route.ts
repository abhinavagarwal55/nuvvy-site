import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const CancelSchema = z.object({
  cancellation_reason: z.string().min(1, "Cancellation reason is required"),
});

// POST /api/ops/plant-orders/[id]/cancel
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

  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { cancellation_reason } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verify order exists and is not already cancelled
  const { data: existing, error: fetchError } = await supabase
    .from("plant_orders")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Order is already cancelled" },
      { status: 409 }
    );
  }

  // Update order status to cancelled
  const { error: orderUpdateError } = await supabase
    .from("plant_orders")
    .update({
      status: "cancelled",
      notes: cancellation_reason,
    })
    .eq("id", id);

  if (orderUpdateError) {
    return NextResponse.json(
      { error: orderUpdateError.message },
      { status: 500 }
    );
  }

  // Cancel all items NOT in ('procured', 'installed')
  const { error: itemsUpdateError } = await supabase
    .from("plant_order_items")
    .update({
      status: "cancelled",
      note: cancellation_reason,
    })
    .eq("plant_order_id", id)
    .not("status", "in", "(procured,installed)");

  if (itemsUpdateError) {
    return NextResponse.json(
      { error: itemsUpdateError.message },
      { status: 500 }
    );
  }

  // Audit log
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.cancelled",
    targetTable: "plant_orders",
    targetId: id,
    metadata: { cancellation_reason },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { id, status: "cancelled" } });
}
