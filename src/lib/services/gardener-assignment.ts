import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Customer-centric gardener assignment helpers.
 *
 * A customer's garden is tended by exactly one PRIMARY gardener
 * (customers.primary_gardener_id, mirrored onto all active service_slots and
 * stamped on generated service_visits.assigned_gardener_id) and at most one
 * SECONDARY co-visit gardener (customers.secondary_gardener_id, added to future
 * services via service_visit_gardeners only — never written as assigned).
 *
 * These helpers are shared by:
 *   - POST /api/ops/customers/[id]/gardeners   (voluntary change, respects gardener_customized)
 *   - POST /api/ops/people/[id]/reassign-and-deactivate (ignores gardener_customized)
 */

export const today = (): string => new Date().toISOString().split("T")[0];

/**
 * Verify a gardener exists and is active. Returns:
 *   { ok: true }                              — usable
 *   { ok: false, status: 404 }                — not found
 *   { ok: false, status: 409 }                — exists but inactive
 */
export async function checkGardenerUsable(
  supabase: SupabaseClient,
  gardenerId: string
): Promise<{ ok: true } | { ok: false; status: 404 | 409; error: string }> {
  const { data, error } = await supabase
    .from("gardeners")
    .select("id, is_active")
    .eq("id", gardenerId)
    .maybeSingle();

  if (error) return { ok: false, status: 409, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Gardener not found" };
  if (!data.is_active)
    return { ok: false, status: 409, error: "Cannot assign work to an inactive gardener" };
  return { ok: true };
}

/**
 * Apply a {primary, secondary?} gardener set to a list of service_visits:
 *   - UPDATE assigned_gardener_id = primary for those services
 *   - rebuild service_visit_gardeners for those services to exactly {primary, secondary?}
 *     (removes any stale members — old primary, removed secondary — and keeps the
 *      membership in sync so the gardener "today"/"history" views are correct)
 *
 * Caller is responsible for having already scoped serviceIds to
 * status='scheduled' AND scheduled_date >= today. No-op on empty input.
 */
export async function applyGardenersToServices(
  supabase: SupabaseClient,
  serviceIds: string[],
  primaryId: string,
  secondaryId: string | null,
  assignedBy: string | null
): Promise<void> {
  if (serviceIds.length === 0) return;

  const { error: updErr } = await supabase
    .from("service_visits")
    .update({ assigned_gardener_id: primaryId })
    .in("id", serviceIds);
  if (updErr) throw new Error(`Failed to update services: ${updErr.message}`);

  // Rebuild junction membership = {primary, secondary?} for exactly these services.
  const { error: delErr } = await supabase
    .from("service_visit_gardeners")
    .delete()
    .in("service_id", serviceIds);
  if (delErr) throw new Error(`Failed to clear gardener junction: ${delErr.message}`);

  const junctionRows: {
    service_id: string;
    gardener_id: string;
    assigned_by: string | null;
  }[] = [];
  for (const sid of serviceIds) {
    junctionRows.push({ service_id: sid, gardener_id: primaryId, assigned_by: assignedBy });
    if (secondaryId && secondaryId !== primaryId) {
      junctionRows.push({ service_id: sid, gardener_id: secondaryId, assigned_by: assignedBy });
    }
  }

  const { error: insErr } = await supabase
    .from("service_visit_gardeners")
    .insert(junctionRows);
  if (insErr) throw new Error(`Failed to rebuild gardener junction: ${insErr.message}`);
}

/**
 * Re-point all of a customer's ACTIVE slots to a new primary gardener.
 * Keeps the invariant service_slots.gardener_id == customers.primary_gardener_id.
 * Returns the number of slots updated.
 */
export async function repointActiveSlots(
  supabase: SupabaseClient,
  customerId: string,
  primaryId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("service_slots")
    .update({ gardener_id: primaryId })
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error(`Failed to re-point slots: ${error.message}`);
  return data?.length ?? 0;
}

export type FutureService = {
  id: string;
  scheduled_date: string;
  assigned_gardener_id: string | null;
  gardener_customized: boolean;
};

/**
 * Fetch every modifiable (status='scheduled', scheduled_date >= today) service
 * for a customer, with the fields needed to split default vs. customized.
 */
export async function fetchFutureScheduledServices(
  supabase: SupabaseClient,
  customerId: string
): Promise<FutureService[]> {
  const { data, error } = await supabase
    .from("service_visits")
    .select("id, scheduled_date, assigned_gardener_id, gardener_customized")
    .eq("customer_id", customerId)
    .eq("status", "scheduled")
    .gte("scheduled_date", today())
    .order("scheduled_date", { ascending: true });
  if (error) throw new Error(`Failed to load future services: ${error.message}`);
  return (data ?? []) as FutureService[];
}

/**
 * Resolve a gardeners.id from a profiles.id. People routes are keyed by profile
 * id; all assignment references (slots, services, customers) use gardeners.id.
 * Returns null if the profile is not a gardener.
 */
export async function resolveGardenerId(
  supabase: SupabaseClient,
  profileId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("gardeners")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data?.id ?? null;
}

export type DeactivationImpact = {
  primary_customers: { id: string; name: string }[];
  secondary_customers: { id: string; name: string }[];
  future_service_count: number;
  in_progress: { id: string; scheduled_date: string }[];
};

/**
 * Compute everything that blocks a gardener's deactivation: customers where they
 * are primary/secondary, the count of future scheduled services they're on
 * (assigned OR co-visit junction member), and any in-progress visit (warn-only).
 */
export async function computeDeactivationImpact(
  supabase: SupabaseClient,
  gardenerId: string
): Promise<DeactivationImpact> {
  const t = today();

  const [primaryRes, secondaryRes, assignedRes, junctionRes, inProgressRes] = await Promise.all([
    supabase.from("customers").select("id, name").eq("primary_gardener_id", gardenerId),
    supabase.from("customers").select("id, name").eq("secondary_gardener_id", gardenerId),
    supabase
      .from("service_visits")
      .select("id")
      .eq("assigned_gardener_id", gardenerId)
      .eq("status", "scheduled")
      .gte("scheduled_date", t),
    supabase.from("service_visit_gardeners").select("service_id").eq("gardener_id", gardenerId),
    supabase
      .from("service_visits")
      .select("id, scheduled_date")
      .eq("assigned_gardener_id", gardenerId)
      .eq("status", "in_progress"),
  ]);

  const futureIds = new Set<string>((assignedRes.data ?? []).map((r) => r.id));

  // Junction memberships may include co-visit services on customers where this
  // gardener is not primary/secondary — fold those future scheduled ids in too.
  const junctionServiceIds = (junctionRes.data ?? []).map((r) => r.service_id);
  if (junctionServiceIds.length > 0) {
    const { data: junctionFuture } = await supabase
      .from("service_visits")
      .select("id")
      .in("id", junctionServiceIds)
      .eq("status", "scheduled")
      .gte("scheduled_date", t);
    for (const r of junctionFuture ?? []) futureIds.add(r.id);
  }

  return {
    primary_customers: (primaryRes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    secondary_customers: (secondaryRes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    future_service_count: futureIds.size,
    in_progress: (inProgressRes.data ?? []).map((r) => ({
      id: r.id,
      scheduled_date: r.scheduled_date,
    })),
  };
}
