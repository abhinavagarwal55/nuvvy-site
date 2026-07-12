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
): Promise<"done" | "failed"> {
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
    return "done";
  }
  await supabase
    .from("service_special_tasks")
    .update({ translation_status: "failed", translated_at: new Date().toISOString() })
    .eq("id", taskId);
  return "failed";
}

/**
 * Auto-translate a checklist template item's English label into hi/kn and clear
 * needs_translation_review. On failure the row keeps needs_translation_review=true
 * (badge shows, translator can fill hi/kn manually).
 */
export async function translateChecklistItem(
  supabase: DB,
  id: string,
  text: string
): Promise<void> {
  const outcome = await translateToHiKn(text);
  if (outcome.status === "done") {
    await supabase
      .from("checklist_template_items")
      .update({ label_hi: outcome.hi, label_kn: outcome.kn, needs_translation_review: false })
      .eq("id", id);
  }
}

/**
 * Auto-translate a care action's English display_name into hi/kn and clear
 * needs_translation_review. On failure the row is left for manual translation.
 */
export async function translateCareAction(
  supabase: DB,
  id: string,
  text: string
): Promise<void> {
  const outcome = await translateToHiKn(text);
  if (outcome.status === "done") {
    await supabase
      .from("care_action_types")
      .update({ display_name_hi: outcome.hi, display_name_kn: outcome.kn, needs_translation_review: false })
      .eq("id", id);
  }
}

/**
 * Translate a service guideline's text and persist the variants.
 */
export async function translateGuideline(
  supabase: DB,
  guidelineId: string,
  text: string
): Promise<void> {
  const outcome = await translateToHiKn(text);
  if (outcome.status === "done") {
    await supabase
      .from("service_guidelines")
      .update({
        text_hi: outcome.hi,
        text_kn: outcome.kn,
        translation_status: "done",
        translated_at: new Date().toISOString(),
      })
      .eq("id", guidelineId);
  } else {
    await supabase
      .from("service_guidelines")
      .update({ translation_status: "failed", translated_at: new Date().toISOString() })
      .eq("id", guidelineId);
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
): Promise<"done" | "failed"> {
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
    return "done";
  }
  await supabase
    .from("service_visits")
    .update({
      internal_notes_translation_status: "failed",
      internal_notes_translated_at: new Date().toISOString(),
    })
    .eq("id", visitId);
  return "failed";
}
