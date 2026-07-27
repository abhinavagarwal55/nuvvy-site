import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * On-Demand Service — shared server helpers (Phase 1).
 *
 * On-demand customers are billed per hour for one-off visits. A service is a
 * `service_visits` row (is_one_off = true, subscription_id NULL, plan_id = the
 * on-demand plan). Completing it auto-generates a per-hour `bills` row
 * (bill_type = 'ondemand'). See the On-Demand Service prompt.
 */

// Acquisition sources — must match customers_source_check in
// 20260728000000_ondemand_customers_and_services.sql.
export const ONDEMAND_SOURCES = ["direct", "aviha.ai", "referral"] as const;
export type OnDemandSource = (typeof ONDEMAND_SOURCES)[number];

// Labels for the two care items that are always applied on an on-demand visit
// (PRD: fertilizer + neem oil are required, non-skippable). These MATCH the
// `care_action_types` display names ('Apply Fertilizer' / 'Apply Neem Oil') so
// the on-demand checklist reuses the SAME human-curated hi/kn translations that
// ops maintains under Settings → Care Action Names (see migration
// 20260728000004). Seeded as inactive checklist_template_items.
export const ONDEMAND_FORCED_ITEMS = [
  "Apply Fertilizer",
  "Apply Neem Oil",
] as const;

/** Bill amount in whole rupees (Indian billing has no paise here). */
export function computeBillAmountInr(actualHours: number, hourlyRate: number): number {
  return Math.round(actualHours * hourlyRate);
}

export type OnDemandPlan = {
  id: string;
  name: string;
  hourly_rate: number;
  plan_type: string;
  is_active: boolean;
};

/**
 * Load + validate an on-demand plan. Returns the plan or an error reason. A
 * valid plan is plan_type='ondemand', active, with a positive hourly_rate.
 */
export async function getActiveOnDemandPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<{ ok: true; plan: OnDemandPlan } | { ok: false; error: string; status: number }> {
  const { data: plan } = await supabase
    .from("service_plans")
    .select("id, name, hourly_rate, plan_type, is_active")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) return { ok: false, error: "Plan not found", status: 404 };
  if (plan.plan_type !== "ondemand") {
    return { ok: false, error: "Plan is not an on-demand plan", status: 400 };
  }
  if (!plan.is_active) return { ok: false, error: "Plan is inactive", status: 400 };
  if (!plan.hourly_rate || plan.hourly_rate <= 0) {
    return { ok: false, error: "Plan has no hourly rate", status: 400 };
  }
  return { ok: true, plan: plan as OnDemandPlan };
}

/**
 * Seed the visit checklist for an on-demand service: the standard active
 * template items PLUS fertilizer + neem oil as required, non-skippable items.
 * Idempotent — no-op if the visit already has checklist rows.
 */
export async function seedOnDemandChecklist(
  supabase: SupabaseClient,
  visitId: string
): Promise<void> {
  const { count } = await supabase
    .from("visit_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", visitId);
  if ((count ?? 0) > 0) return;

  const { data: templates } = await supabase
    .from("checklist_template_items")
    .select("id, label, is_required, order_index")
    .eq("is_active", true)
    .order("order_index");

  const rows: Record<string, unknown>[] = (templates ?? []).map((t) => ({
    visit_id: visitId,
    template_item_id: t.id,
    label: t.label,
    is_required: t.is_required,
    order_index: t.order_index,
    is_completed: false,
    completion_status: "pending",
  }));

  // Reference the translated (inactive) template rows for the forced items so
  // the gardener checklist join resolves label_hi / label_kn (see migration
  // 20260728000003). Falls back to a plain snapshot row if they're missing.
  const { data: forcedTemplates } = await supabase
    .from("checklist_template_items")
    .select("id, label")
    .in("label", [...ONDEMAND_FORCED_ITEMS])
    .eq("is_active", false);
  const forcedIdByLabel: Record<string, string> = Object.fromEntries(
    (forcedTemplates ?? []).map((t) => [t.label as string, t.id as string])
  );

  const maxOrder = rows.reduce((m, r) => Math.max(m, (r.order_index as number) ?? 0), 0);
  ONDEMAND_FORCED_ITEMS.forEach((label, i) => {
    rows.push({
      visit_id: visitId,
      template_item_id: forcedIdByLabel[label] ?? null,
      label,
      is_required: true,
      order_index: maxOrder + 1 + i,
      is_completed: false,
      completion_status: "pending",
    });
  });

  if (rows.length > 0) {
    await supabase.from("visit_checklist_items").insert(rows);
  }
}

export type OnDemandServiceForBill = {
  id: string;
  customer_id: string;
  actual_hours_spent: number;
  hourly_rate: number;
};

export type BillUpsertResult =
  | { action: "created" | "updated"; bill: Record<string, unknown> & { id: string } }
  | { action: "skipped_paid"; bill: Record<string, unknown> & { id: string } }
  | { action: "error"; error: string };

/**
 * Create (on completion) or recalc (on hours edit) the on-demand bill for a
 * service. One bill per service_visit (enforced by a unique index). A bill in
 * 'paid' status is immutable — recalc is skipped.
 */
export async function upsertOnDemandBill(
  supabase: SupabaseClient,
  service: OnDemandServiceForBill,
  createdBy: string | null
): Promise<BillUpsertResult> {
  const { data: existing } = await supabase
    .from("bills")
    .select("id, status, hourly_rate")
    .eq("service_visit_id", service.id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "paid") {
      return { action: "skipped_paid", bill: existing as Record<string, unknown> & { id: string } };
    }
    // Recalc against the SNAPSHOTTED rate (PRD: the bill locks the rate at
    // generation time, immune to later plan price changes).
    const rate = (existing.hourly_rate as number | null) ?? service.hourly_rate;
    const { data, error } = await supabase
      .from("bills")
      .update({
        amount_inr: computeBillAmountInr(service.actual_hours_spent, rate),
        actual_hours_spent: service.actual_hours_spent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { action: "error", error: error.message };
    return { action: "updated", bill: data as Record<string, unknown> & { id: string } };
  }

  const amountInr = computeBillAmountInr(service.actual_hours_spent, service.hourly_rate);

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("bills")
    .insert({
      bill_type: "ondemand",
      service_visit_id: service.id,
      customer_id: service.customer_id,
      amount_inr: amountInr,
      hourly_rate: service.hourly_rate,
      actual_hours_spent: service.actual_hours_spent,
      status: "draft",
      generated_at: nowIso,
      updated_at: nowIso,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) return { action: "error", error: error.message };
  return { action: "created", bill: data as Record<string, unknown> & { id: string } };
}
