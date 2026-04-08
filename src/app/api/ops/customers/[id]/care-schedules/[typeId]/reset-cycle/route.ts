import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// POST /api/ops/customers/[id]/care-schedules/[typeId]/reset-cycle
// Horticulturist-only: resets cycle_anchor_date = today, recalculates next_due
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; typeId: string }> }
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

  const { id, typeId } = await params;
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  // Get the care action type's default frequency
  const { data: actionType } = await supabase
    .from("care_action_types")
    .select("id, default_frequency_days")
    .eq("id", typeId)
    .single();

  if (!actionType) {
    return NextResponse.json({ error: "Care action type not found" }, { status: 404 });
  }

  // Compute next_due = today + frequency_days
  const nextDue = new Date(today + "T00:00:00");
  nextDue.setDate(nextDue.getDate() + actionType.default_frequency_days);
  const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, "0")}-${String(nextDue.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("customer_care_schedules")
    .update({
      cycle_anchor_date: today,
      next_due_date: nextDueStr,
      cycle_reset_by: auth.userId,
      cycle_reset_at: new Date().toISOString(),
    })
    .eq("customer_id", id)
    .eq("care_action_type_id", typeId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Care schedule not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "care_cycle.reset",
    targetTable: "customer_care_schedules",
    targetId: data.id,
    metadata: { customer_id: id, care_action_type_id: typeId, new_anchor: today },
  });

  return NextResponse.json({ data });
}
