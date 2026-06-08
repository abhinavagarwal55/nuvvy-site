import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/plant-order-items/[id]/mark-installed — mark item installed
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

  // Fetch item
  const { data: item, error: itemError } = await supabase
    .from("plant_order_items")
    .select("id, status, plant_order_id")
    .eq("id", id)
    .single();

  if (itemError) {
    if (itemError.code === "PGRST116") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (item.status !== "procured") {
    return NextResponse.json(
      { error: "Item must be in 'procured' status to mark as installed" },
      { status: 409 }
    );
  }

  // Install fact lives in installed_at, NOT the status enum (FD-3). Status stays
  // 'procured'. And logistics never writes plant_orders.status (FD-4).
  const { error: updateError } = await supabase
    .from("plant_order_items")
    .update({ installed_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order_item.installed",
    targetTable: "plant_order_items",
    targetId: id,
    metadata: { plant_order_id: item.plant_order_id },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { id, installed: true },
  });
}
