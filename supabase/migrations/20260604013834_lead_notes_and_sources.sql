-- ─────────────────────────────────────────
-- LEAD NOTES + SOURCE TAXONOMY (Leads CRM v1.1, post-feedback)
-- 1. Append-only, timestamped, authored note timeline (mirrors customer_observations).
-- 2. New source taxonomy: customer_referral | website_lead | social_media | other.
-- ─────────────────────────────────────────

-- ── 1. lead_notes — one row per note, never edited in place ───────────────────
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes (lead_id, created_at DESC);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
-- No policies — API enforces ops auth (matches existing ops-table pattern).

-- Migrate any existing single-field notes into the timeline so nothing is lost.
INSERT INTO public.lead_notes (lead_id, body, created_by, created_at)
SELECT id, notes, NULL, COALESCE(last_touch_at, created_at)
FROM public.leads
WHERE notes IS NOT NULL AND btrim(notes) <> '';

-- ── 2. New source taxonomy ────────────────────────────────────────────────────
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

-- Remap existing values onto the new set.
UPDATE public.leads SET source = 'customer_referral' WHERE source = 'referral';
UPDATE public.leads
  SET source = 'other'
  WHERE source IS NOT NULL
    AND source NOT IN ('customer_referral','website_lead','social_media','other');

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IS NULL OR source IN (
    'customer_referral','website_lead','social_media','other'
  ));

-- The legacy leads.notes column is now superseded by lead_notes. Left in place
-- (non-destructive); no longer written by the application.
