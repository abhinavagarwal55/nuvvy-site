import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceResult } from "./visits";

export type ChecklistItem = {
  id: string;
  visit_id: string;
  template_item_id: string | null;
  label: string;
  is_required: boolean;
  order_index: number;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

export async function resolveChecklistForVisit(
  visitId: string,
  supabase: SupabaseClient
): Promise<ServiceResult<ChecklistItem[]>> {
  // TODO Week 2: fetch template items + any visit-specific overrides, merge
  return { error: "Not implemented" };
}
