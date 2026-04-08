import type { SupabaseClient } from "@supabase/supabase-js";

// Every service function:
// 1. Accepts typed parameters + a supabase client (injected, not imported)
// 2. Returns a discriminated union: { data: T } | { error: string }
// 3. Never throws — catch internally and return { error: ... }

export type ServiceResult<T> = { data: T } | { error: string };

export type Visit = {
  id: string;
  customer_id: string;
  subscription_id: string | null;
  assigned_gardener_id: string | null;
  slot_id: string | null;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: "scheduled" | "in_progress" | "completed" | "missed" | "cancelled";
  gardener_notes: string | null;
  ops_notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getVisitById(
  visitId: string,
  supabase: SupabaseClient
): Promise<ServiceResult<Visit>> {
  try {
    const { data, error } = await supabase
      .from("service_visits")
      .select("*")
      .eq("id", visitId)
      .single();
    if (error || !data) return { error: "Visit not found" };
    return { data };
  } catch {
    return { error: "Unexpected error fetching visit" };
  }
}

export async function completeVisit(
  visitId: string,
  completedByGardenerId: string,
  supabase: SupabaseClient
): Promise<ServiceResult<{ visitId: string }>> {
  // TODO Week 2: verify checklist complete, update status, set completed_at
  return { error: "Not implemented" };
}
