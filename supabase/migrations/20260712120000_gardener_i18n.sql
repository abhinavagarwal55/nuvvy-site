-- Gardener i18n core (PRD nuvvy-gardener-i18n-prd.md §2.2 / §3.1).
-- Persist the gardener's language preference on the server as the source of
-- truth; the nuvvy_lang cookie mirrors it for flash-free server rendering.
-- English is always the default + fallback.

ALTER TABLE public.gardeners
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
  CHECK (preferred_language IN ('en', 'hi', 'kn'));
