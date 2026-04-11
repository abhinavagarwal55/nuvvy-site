import { getSupabaseAdmin } from "@/lib/supabase/server";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Care Action Types ──────────────────────────────────────────────────────

type CareActionType = { id: string; name: string; default_frequency_days: number };

let careActionTypesCache: { data: CareActionType[]; fetchedAt: number } | null = null;

export async function getCachedCareActionTypes(): Promise<CareActionType[]> {
  if (careActionTypesCache && Date.now() - careActionTypesCache.fetchedAt < TTL_MS) {
    return careActionTypesCache.data;
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days")
    .order("name");

  const result = data ?? [];
  careActionTypesCache = { data: result, fetchedAt: Date.now() };
  return result;
}

// ─── Service Plans ──────────────────────────────────────────────────────────

type ServicePlan = { id: string; name: string; visit_frequency: string; price: number; is_active: boolean };

let servicePlansCache: { data: ServicePlan[]; fetchedAt: number } | null = null;

export async function getCachedServicePlans(): Promise<ServicePlan[]> {
  if (servicePlansCache && Date.now() - servicePlansCache.fetchedAt < TTL_MS) {
    return servicePlansCache.data;
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("service_plans")
    .select("id, name, visit_frequency, price, is_active")
    .order("name");

  const result = data ?? [];
  servicePlansCache = { data: result, fetchedAt: Date.now() };
  return result;
}
