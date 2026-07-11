-- Checklist + care-action manual translations (D1/D4) and AI translate-on-write
-- columns for special tasks + per-visit internal notes (D2).
-- PRD: nuvvy-gardener-i18n-prd.md §0 Addendum (2026-07-12, authoritative), §8.
--
-- Invariants:
--   * English is canonical and the fallback — *_hi / *_kn are nullable and are
--     NEVER used to null out English.
--   * needs_translation_review = true on create or English change; cleared to
--     false when a translator saves the hi/kn edit.
--   * visit_checklist_items snapshots are NOT touched here (history preserved).

-- 1. Manual translations for the fixed checklist template.
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS label_hi text,
  ADD COLUMN IF NOT EXISTS label_kn text,
  ADD COLUMN IF NOT EXISTS needs_translation_review boolean NOT NULL DEFAULT true;

-- 2. Care action types: move English display out of the hardcoded CARE_LABELS
--    map into the DB, plus hi/kn variants.
ALTER TABLE public.care_action_types
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS display_name_hi text,
  ADD COLUMN IF NOT EXISTS display_name_kn text,
  ADD COLUMN IF NOT EXISTS needs_translation_review boolean NOT NULL DEFAULT true;

-- Backfill display_name from the current CARE_LABELS map by slug. Unknown slugs
-- fall back to an initcapped version of the slug so display_name is never NULL.
-- needs_translation_review stays true (default) so every row shows as needing
-- hi/kn until a translator fills them in.
UPDATE public.care_action_types
SET display_name = COALESCE(display_name, CASE name
    WHEN 'fertilizer'     THEN 'Apply Fertilizer'
    WHEN 'vermi_compost'  THEN 'Apply Vermi Compost'
    WHEN 'micro_nutrients' THEN 'Apply Micro Nutrients'
    WHEN 'neem_oil'       THEN 'Apply Neem Oil'
    ELSE initcap(replace(name, '_', ' '))
  END)
WHERE display_name IS NULL;

-- 3. Special tasks — AI translate-on-write (D2 / §8.4).
ALTER TABLE public.service_special_tasks
  ADD COLUMN IF NOT EXISTS description_hi text,
  ADD COLUMN IF NOT EXISTS description_kn text,
  ADD COLUMN IF NOT EXISTS translation_status text NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

-- 4. Per-visit internal notes — AI translate-on-write (D2).
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS internal_notes_hi text,
  ADD COLUMN IF NOT EXISTS internal_notes_kn text,
  ADD COLUMN IF NOT EXISTS internal_notes_translation_status text NOT NULL DEFAULT 'pending'
    CHECK (internal_notes_translation_status IN ('pending', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS internal_notes_translated_at timestamptz;
