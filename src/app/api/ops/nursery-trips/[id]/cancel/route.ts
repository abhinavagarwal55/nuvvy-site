import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/nursery-trips/[id]/cancel — cancel trip, revert items
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

  const { data: trip, error: fetchError } = await supabase
    .from("nursery_trips")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (trip.status === "cancelled") {
    return NextResponse.json(
      { error: "Trip is already cancelled" },
      { status: 409 }
    );
  }

  // Revert all linked items to 'requested' and clear nursery_trip_id
  const { error: revertError } = await supabase
    .from("plant_order_items")
    .update({ nursery_trip_id: null, status: "requested" })
    .eq("nursery_trip_id", id);

  if (revertError) {
    return NextResponse.json({ error: revertError.message }, { status: 500 });
  }

  // Cancel the trip
  const { data: updated, error: updateError } = await supabase
    .from("nursery_trips")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "nursery_trip.cancelled",
    targetTable: "nursery_trips",
    targetId: id,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
