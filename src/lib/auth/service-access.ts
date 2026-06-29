import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether a gardener is assigned to a service — either as the primary
 * (service_visits.assigned_gardener_id) or as a secondary participant in the
 * service_visit_gardeners junction.
 *
 * Used to gate gardener access to a visit's detail and execution actions so
 * co-assigned gardeners (not just the primary) can open and run the visit,
 * matching what the gardener Today/History lists already surface.
 *
 * Pass the already-loaded primary id when available to short-circuit the query
 * (and to keep primary access working even for rows with no junction entry).
 */
export async function isGardenerAssignedToService(
  supabase: SupabaseClient,
  serviceId: string,
  gardenerId: string,
  primaryAssignedId?: string | null
): Promise<boolean> {
  if (primaryAssignedId && primaryAssignedId === gardenerId) return true;
  const { data } = await supabase
    .from("service_visit_gardeners")
    .select("gardener_id")
    .eq("service_id", serviceId)
    .eq("gardener_id", gardenerId)
    .maybeSingle();
  return Boolean(data);
}
