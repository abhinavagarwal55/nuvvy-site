import type { SupabaseClient } from "@supabase/supabase-js";
import { translateToHiKn } from "./translateText";

// Translate-on-write for the two AI-translated free-text fields (PRD §8, D2):
//   service_special_tasks.description  → description_hi / description_kn
//   service_visits.internal_notes      → internal_notes_hi / internal_notes_kn
//
// Called inline after a write. On success writes both variants + status 'done';
// on any failure writes status 'failed' (gardener then sees the English
// original only). Never throws — translation must never break the save.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

/**
 * Translate a special task's description and persist the variants.
 * `text` is the English original just written.
 */
export async function translateSpecialTask(
  supabase: DB,
  taskId: string,
  text: string
): Promise<void> {
  const outcome = await translateToHiKn(text);
  if (outcome.status === "done") {
    await supabase
      .from("service_special_tasks")
      .update({
        description_hi: outcome.hi,
        description_kn: outcome.kn,
        translation_status: "done",
        translated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  } else {
    await supabase
      .from("service_special_tasks")
      .update({ translation_status: "failed", translated_at: new Date().toISOString() })
      .eq("id", taskId);
  }
}

/**
 * Translate a visit's internal notes and persist the variants. Pass the English
 * original just written (non-empty). Clearing to empty is handled by the caller
 * (it nulls the variants instead of calling this).
 */
export async function translateInternalNotes(
  supabase: DB,
  visitId: string,
  text: string
): Promise<void> {
  const outcome = await translateToHiKn(text);
  if (outcome.status === "done") {
    await supabase
      .from("service_visits")
      .update({
        internal_notes_hi: outcome.hi,
        internal_notes_kn: outcome.kn,
        internal_notes_translation_status: "done",
        internal_notes_translated_at: new Date().toISOString(),
      })
      .eq("id", visitId);
  } else {
    await supabase
      .from("service_visits")
      .update({
        internal_notes_translation_status: "failed",
        internal_notes_translated_at: new Date().toISOString(),
      })
      .eq("id", visitId);
  }
}
