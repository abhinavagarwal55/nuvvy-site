-- Curated List Sub-sections (nuvvy-f5-shortlist-revamp-prd.md, Slice 1)
--
-- Organises a curated list's PLANTS into 1–10 named sub-sections. Mirrors the
-- existing draft/version duality: a mutable draft-side section table and an
-- immutable version-side snapshot created on send. Additive + idempotent.
--
-- NOTE: customer-facing copy renames "shortlist" → "curated list", but DB
-- tables/columns keep their existing names on purpose.

BEGIN;

-- ── Draft-side sections (mutable) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shortlist_draft_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES public.shortlists(id) ON DELETE CASCADE,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shortlist_draft_sections_shortlist
  ON public.shortlist_draft_sections(shortlist_id);

-- ── Version-side sections (immutable snapshot) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.shortlist_version_sections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_version_id uuid NOT NULL REFERENCES public.shortlist_versions(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shortlist_version_sections_version
  ON public.shortlist_version_sections(shortlist_version_id);

-- ── section_id on both item tables ───────────────────────────────────────────
ALTER TABLE public.shortlist_draft_items
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.shortlist_draft_sections(id) ON DELETE CASCADE;
ALTER TABLE public.shortlist_version_items
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.shortlist_version_sections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_shortlist_draft_items_section
  ON public.shortlist_draft_items(section_id);
CREATE INDEX IF NOT EXISTS idx_shortlist_version_items_section
  ON public.shortlist_version_items(section_id);

-- ── Backfill (idempotent) ────────────────────────────────────────────────────
-- Every shortlist that has draft items gets a single "Section 1" draft section
-- (only if it has none yet); its section-less draft items are assigned to it.
DO $$
DECLARE
  sl RECORD;
  new_section_id uuid;
BEGIN
  FOR sl IN
    SELECT DISTINCT di.shortlist_id
    FROM public.shortlist_draft_items di
    WHERE NOT EXISTS (
      SELECT 1 FROM public.shortlist_draft_sections s WHERE s.shortlist_id = di.shortlist_id
    )
  LOOP
    INSERT INTO public.shortlist_draft_sections (shortlist_id, name, sort_order)
    VALUES (sl.shortlist_id, 'Section 1', 0)
    RETURNING id INTO new_section_id;

    UPDATE public.shortlist_draft_items
    SET section_id = new_section_id
    WHERE shortlist_id = sl.shortlist_id AND section_id IS NULL;
  END LOOP;
END $$;

-- NOTE: version-side (snapshot) items are immutable — a DB trigger blocks
-- UPDATE. We therefore do NOT backfill section_id on existing shortlist_version_items.
-- Legacy sent/submitted versions simply have no version_sections; the public
-- read API parks their section-less plants into a single synthetic section, so
-- they render (correctly) as a single-section list. New sends snapshot sections
-- going forward.

ALTER TABLE public.shortlist_draft_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlist_version_sections ENABLE ROW LEVEL SECURITY;

COMMIT;
