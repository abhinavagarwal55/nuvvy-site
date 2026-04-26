import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { computeNextDueDate, todayUtcStr } from "@/lib/services/care-schedule";

const UpdateSchema = z.object({
  default_frequency_days: z.number().int().min(1).max(365),
});

// PATCH /api/ops/care-action-types/[id]
// Updates the system default frequency for a care action type and recomputes
// next_due_date for every customer_care_schedule using the anchored model.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const newFreq = parsed.data.default_frequency_days;
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Care action type not found" }, { status: 404 });
  }

  const oldFreq = existing.default_frequency_days;

  const { data: updated, error: updateErr } = await supabase
    .from("care_action_types")
    .update({ default_frequency_days: newFreq })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Recompute next_due_date for all customer schedules using this action type.
  const { data: schedules } = await supabase
    .from("customer_care_schedules")
    .select("id, cycle_anchor_date, last_done_date")
    .eq("care_action_type_id", id);

  const today = todayUtcStr();
  let recomputed = 0;

  for (const s of schedules ?? []) {
    const newNextDue = computeNextDueDate(
      s.cycle_anchor_date,
      s.last_done_date,
      newFreq,
      today
    );
    await supabase
      .from("customer_care_schedules")
      .update({ next_due_date: newNextDue })
      .eq("id", s.id);
    recomputed++;
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "care_action.frequency_updated",
    targetTable: "care_action_types",
    targetId: id,
    metadata: {
      name: existing.name,
      old_frequency_days: oldFreq,
      new_frequency_days: newFreq,
      schedules_recomputed: recomputed,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: updated,
    schedules_recomputed: recomputed,
  });
}
