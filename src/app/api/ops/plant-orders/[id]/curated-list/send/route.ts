import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { publishShortlist } from "@/lib/services/shortlists";
import type { PlantOrderStatus } from "@/lib/schemas/plant-order";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/ops/plant-orders/[id]/curated-list/send
// Publish the curated list (→ SENT_TO_CUSTOMER) and, guarded on current status,
// auto-advance the order interested → finalizing (no-op if already finalizing).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();

  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order.curated_shortlist_id) {
    return NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 });
  }

  const result = await publishShortlist(supabase, order.curated_shortlist_id, request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Guarded auto-advance: the ONLY status transition "send" triggers.
  const currentStatus = order.status as PlantOrderStatus;
  let advanced = false;
  if (currentStatus === "interested") {
    const { error: advErr } = await supabase
      .from("plant_orders")
      .update({ status: "finalizing" })
      .eq("id", id)
      .eq("status", "interested"); // optimistic guard against a concurrent change
    if (!advErr) {
      advanced = true;
      logAuditEvent({
        actorId: auth.userId,
        actorRole: auth.role,
        action: "plant_order.status_changed",
        targetTable: "plant_orders",
        targetId: id,
        metadata: { from: "interested", to: "finalizing", via: "curated_list_sent" },
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.curated_list_sent",
    targetTable: "plant_orders",
    targetId: id,
    metadata: {
      shortlist_id: order.curated_shortlist_id,
      version_number: result.data.version_number,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: {
      publicUrl: result.data.publicUrl,
      version_number: result.data.version_number,
      advanced,
    },
  });
}
