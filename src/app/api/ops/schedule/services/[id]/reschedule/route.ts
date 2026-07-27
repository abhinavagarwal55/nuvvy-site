import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { planSeriesShift } from "@/lib/services/series-shift";

const RescheduleSchema = z.object({
  new_date: z.string(), // YYYY-MM-DD
  new_start_time: z.string().optional(), // HH:MM
  new_end_time: z.string().optional(),
  reason: z.string().optional(), // required for commits (enforced below)
  scope: z.enum(["this_visit", "this_and_following"]).default("this_visit"),
  dry_run: z.boolean().optional().default(false),
});

// POST /api/ops/schedule/services/[id]/reschedule
//  - scope='this_visit'          → move only this visit (unchanged, default)
//  - scope='this_and_following'  → shift the fortnightly/monthly series
//      · dry_run:true  → preview only, no writes
//      · dry_run:false → atomic commit (RPC)
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
  const body = await request.json();
  const parsed = RescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (d.scope === "this_and_following") {
    return handleSeriesShift(request, auth, id, d);
  }

  // ---- scope === 'this_visit' — unchanged behaviour ----
  if (!d.reason || d.reason.trim() === "") {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify service exists and is in a reschedulable state
  const { data: service, error: svcErr } = await supabase
    .from("service_visits")
    .select("id, status, scheduled_date")
    .eq("id", id)
    .single();

  if (svcErr || !service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot reschedule: service status is ${service.status}` },
      { status: 400 }
    );
  }

  // Capture old values for audit trail
  const oldDate = service.scheduled_date;
  const { data: fullService } = await supabase
    .from("service_visits")
    .select("time_window_start, time_window_end")
    .eq("id", id)
    .single();
  const oldStartTime = fullService?.time_window_start ?? null;
  const oldEndTime = fullService?.time_window_end ?? null;

  // Update just this service — slot is unchanged
  const updates: Record<string, string> = {
    scheduled_date: d.new_date,
  };
  if (d.new_start_time) {
    updates.time_window_start = d.new_start_time;
  }
  if (d.new_end_time) {
    updates.time_window_end = d.new_end_time;
  }

  const { data, error } = await supabase
    .from("service_visits")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.rescheduled",
    targetTable: "service_visits",
    targetId: id,
    metadata: {
      old_date: oldDate,
      old_start_time: oldStartTime,
      old_end_time: oldEndTime,
      new_date: d.new_date,
      new_start_time: d.new_start_time ?? null,
      new_end_time: d.new_end_time ?? null,
      reason: d.reason,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}

type Auth = Awaited<ReturnType<typeof requireOpsAuth>>;
type Body = z.infer<typeof RescheduleSchema>;

// ---- scope === 'this_and_following' — preview + commit share planSeriesShift ----
async function handleSeriesShift(
  request: NextRequest,
  auth: Auth,
  id: string,
  d: Body
) {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  // 1. Load the moved visit.
  const { data: visit, error: visitErr } = await supabase
    .from("service_visits")
    .select("id, status, scheduled_date, slot_id, customer_id")
    .eq("id", id)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // 2. Guards (apply to both preview and commit — a shift needs a real slot).
  if (!visit.slot_id) {
    return NextResponse.json(
      { error: "This is a one-off visit — there is no series to shift." },
      { status: 400 }
    );
  }
  if (visit.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot shift series: visit status is ${visit.status}` },
      { status: 400 }
    );
  }
  if (d.new_date < today) {
    return NextResponse.json(
      { error: "New date cannot be in the past." },
      { status: 400 }
    );
  }

  // 3. Load the slot (must be active) — its weekday defines the anchor.
  const { data: slot, error: slotErr } = await supabase
    .from("service_slots")
    .select(
      "id, customer_id, gardener_id, day_of_week, time_window_start, time_window_end, is_active, effective_from"
    )
    .eq("id", visit.slot_id)
    .single();

  if (slotErr || !slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (!slot.is_active) {
    return NextResponse.json(
      { error: "Cannot shift a series on an inactive slot." },
      { status: 400 }
    );
  }

  // 4. Active subscription + plan frequency.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan_id")
    .eq("customer_id", slot.customer_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "Customer has no active subscription." },
      { status: 400 }
    );
  }

  const { data: plan } = await supabase
    .from("service_plans")
    .select("visit_frequency")
    .eq("id", subscription.plan_id)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 500 });
  }

  // 5. Future scheduled visits on the slot — feeds `removed`.
  const { data: futureVisits } = await supabase
    .from("service_visits")
    .select("id, scheduled_date")
    .eq("slot_id", slot.id)
    .eq("status", "scheduled")
    .gt("scheduled_date", today);

  // 6. Plan (same function for preview and commit).
  const plan_ = planSeriesShift({
    slot: { day_of_week: slot.day_of_week },
    visit: { id: visit.id, scheduled_date: visit.scheduled_date },
    newDate: d.new_date,
    visitFrequency: plan.visit_frequency,
    futureScheduledVisits: futureVisits ?? [],
    weeksAhead: 6,
  });

  // 7. Preview — no writes.
  if (d.dry_run) {
    return NextResponse.json({
      preview: {
        upcoming: plan_.upcoming,
        removed: plan_.removed,
        summary: plan_.summary,
      },
    });
  }

  // ---- Commit ----
  if (!d.reason || d.reason.trim() === "") {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  // Read the co-visit secondary gardener so regenerated visits include it.
  const { data: customerRow } = await supabase
    .from("customers")
    .select("secondary_gardener_id")
    .eq("id", slot.customer_id)
    .single();

  const recurringDates = plan_.upcoming
    .filter((u) => !u.is_moved_visit)
    .map((u) => u.date);

  // Atomic mutation in a single plpgsql transaction (see migration).
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    "shift_service_series",
    {
      p_old_slot_id: slot.id,
      p_moved_visit_id: visit.id,
      p_new_date: d.new_date,
      p_anchor: plan_.anchor,
      p_new_start_time: d.new_start_time ?? null,
      p_new_end_time: d.new_end_time ?? null,
      p_recurring_dates: recurringDates,
      p_subscription_id: subscription.id,
      p_secondary_gardener_id: customerRow?.secondary_gardener_id ?? null,
    }
  );

  if (rpcErr) {
    return NextResponse.json(
      { error: `Failed to shift series: ${rpcErr.message}` },
      { status: 500 }
    );
  }

  const result = rpcResult as {
    new_slot_id: string;
    anchor: string;
    visits_generated: number;
    visits_removed: number;
    removed_ids: string[];
  };

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.series_shifted",
    targetTable: "service_slots",
    targetId: result.new_slot_id,
    metadata: {
      slot_id_old: slot.id,
      slot_id_new: result.new_slot_id,
      old_anchor: slot.effective_from,
      new_anchor: result.anchor,
      moved_visit_id: visit.id,
      moved_from: visit.scheduled_date,
      moved_to: d.new_date,
      visits_removed: result.visits_removed,
      visits_generated: result.visits_generated,
      reason: d.reason,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: {
      new_slot_id: result.new_slot_id,
      anchor: result.anchor,
      visits_generated: result.visits_generated,
      visits_removed: result.visits_removed,
      upcoming: plan_.upcoming,
      removed: plan_.removed,
    },
  });
}
