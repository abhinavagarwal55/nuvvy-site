import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// POST /api/ops/services/[id]/complete
// Validates photo_count >= 2, sets completed_at, updates care schedules
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

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, customer_id, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (service.status !== "in_progress") {
    return NextResponse.json(
      { error: `Cannot complete: status is ${service.status}` },
      { status: 400 }
    );
  }

  // Validate photo count >= 2
  const { count: photoCount } = await supabase
    .from("visit_photos")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", id);

  if ((photoCount ?? 0) < 2) {
    return NextResponse.json(
      { error: "At least 2 photos are required to complete the service" },
      { status: 422 }
    );
  }

  // Update care schedules for any care actions marked done in this service
  const { data: doneActions } = await supabase
    .from("service_care_actions")
    .select("care_action_type_id")
    .eq("service_id", id)
    .eq("marked_done", true);

  if (doneActions && doneActions.length > 0) {
    const today = new Date().toISOString().split("T")[0];

    for (const action of doneActions) {
      // Get the care schedule and action type frequency
      const { data: schedule } = await supabase
        .from("customer_care_schedules")
        .select("id, cycle_anchor_date")
        .eq("customer_id", service.customer_id)
        .eq("care_action_type_id", action.care_action_type_id)
        .single();

      const { data: actionType } = await supabase
        .from("care_action_types")
        .select("default_frequency_days")
        .eq("id", action.care_action_type_id)
        .single();

      if (schedule && actionType) {
        // Anchored model: next_due = anchor + (floor((today - anchor) / freq) + 1) * freq
        const anchor = new Date(schedule.cycle_anchor_date + "T00:00:00");
        const todayDate = new Date(today + "T00:00:00");
        const freq = actionType.default_frequency_days;
        const daysSinceAnchor = Math.floor(
          (todayDate.getTime() - anchor.getTime()) / (86400000)
        );
        const periodsCompleted = Math.floor(daysSinceAnchor / freq) + 1;
        const nextDue = new Date(anchor);
        nextDue.setDate(nextDue.getDate() + periodsCompleted * freq);
        const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, "0")}-${String(nextDue.getDate()).padStart(2, "0")}`;

        await supabase
          .from("customer_care_schedules")
          .update({
            last_done_date: today,
            last_done_service_id: id,
            next_due_date: nextDueStr,
          })
          .eq("id", schedule.id);
      }
    }
  }

  // Mark service completed
  const { data, error } = await supabase
    .from("service_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
