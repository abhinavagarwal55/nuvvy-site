import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { computeNextDueDate, todayUtcStr } from "@/lib/services/care-schedule";
import { translateCareAction } from "@/lib/i18n/translateOnWrite";

// Any subset may be supplied. Structural fields (frequency, English display
// name) are admin-only; translation fields (hi/kn) are admin + horticulturist.
const UpdateSchema = z
  .object({
    default_frequency_days: z.number().int().min(1).max(365).optional(),
    display_name: z.string().min(1).max(200).optional(),
    display_name_hi: z.string().max(200).nullable().optional(),
    display_name_kn: z.string().max(200).nullable().optional(),
  })
  .strict();

// PATCH /api/ops/care-action-types/[id]
// - Frequency change (admin) recomputes next_due_date for every schedule.
// - English display_name change (admin) flags translations for review (D4).
// - hi/kn translation edits (admin + horti) clear the review flag.
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
  if (auth.role !== "admin" && auth.role !== "horticulturist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body = parsed.data;

  const touchesStructural =
    body.default_frequency_days !== undefined || body.display_name !== undefined;
  const touchesTranslation =
    body.display_name_hi !== undefined || body.display_name_kn !== undefined;

  // Horticulturist may edit hi/kn translations ONLY — enforced server-side.
  if (touchesStructural && auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  if (!touchesStructural && !touchesTranslation) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days, display_name")
    .eq("id", id)
    .single();
  if (!existing) {
    return NextResponse.json({ error: "Care action type not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.default_frequency_days !== undefined)
    update.default_frequency_days = body.default_frequency_days;
  if (body.display_name !== undefined) update.display_name = body.display_name;
  if (body.display_name_hi !== undefined) update.display_name_hi = body.display_name_hi;
  if (body.display_name_kn !== undefined) update.display_name_kn = body.display_name_kn;

  const englishChanged =
    body.display_name !== undefined && body.display_name !== existing.display_name;
  if (touchesTranslation) {
    update.needs_translation_review = false;
  } else if (englishChanged) {
    update.needs_translation_review = true;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("care_action_types")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Auto re-translate when the English display name changed (unless the caller
  // supplied its own hi/kn in the same request — a manual override).
  if (englishChanged && !touchesTranslation && body.display_name) {
    await translateCareAction(supabase, id, body.display_name);
  }

  // Recompute next_due_date for all schedules ONLY when frequency changed.
  let recomputed = 0;
  if (
    body.default_frequency_days !== undefined &&
    body.default_frequency_days !== existing.default_frequency_days
  ) {
    const newFreq = body.default_frequency_days;
    const { data: schedules } = await supabase
      .from("customer_care_schedules")
      .select("id, cycle_anchor_date, last_done_date")
      .eq("care_action_type_id", id);
    const today = todayUtcStr();
    for (const s of schedules ?? []) {
      const newNextDue = computeNextDueDate(s.cycle_anchor_date, s.last_done_date, newFreq, today);
      await supabase
        .from("customer_care_schedules")
        .update({ next_due_date: newNextDue })
        .eq("id", s.id);
      recomputed++;
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: touchesTranslation && !touchesStructural ? "care_action.translated" : "care_action.updated",
    targetTable: "care_action_types",
    targetId: id,
    metadata: { name: existing.name, fields: Object.keys(update), schedules_recomputed: recomputed },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated, schedules_recomputed: recomputed });
}
