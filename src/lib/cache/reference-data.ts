import { getSupabaseAdmin } from "@/lib/supabase/server";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Care Action Types ──────────────────────────────────────────────────────

type CareActionType = {
  id: string;
  name: string;
  default_frequency_days: number;
  // Localised display (English canonical + hi/kn variants). Nullable variants
  // fall back to display_name via pickVariant on the client.
  display_name: string | null;
  display_name_hi: string | null;
  display_name_kn: string | null;
};

let careActionTypesCache: { data: CareActionType[]; fetchedAt: number } | null = null;

export async function getCachedCareActionTypes(): Promise<CareActionType[]> {
  if (careActionTypesCache && Date.now() - careActionTypesCache.fetchedAt < TTL_MS) {
    return careActionTypesCache.data;
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days, display_name, display_name_hi, display_name_kn")
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
