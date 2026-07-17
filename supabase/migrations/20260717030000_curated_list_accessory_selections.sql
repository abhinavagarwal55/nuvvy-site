-- Curated list — customer accessory selections (F5 revamp Slice 2)
--
-- Captures (non-binding) which recommended accessories a customer picked on the
-- post-confirmation accessories step. Purchase happens on Amazon; this is purely
-- for horticulturist visibility. Accessories NEVER enter plant_order_items and
-- never change plant order status.
--
-- ADDITIVE ONLY.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shortlist_accessory_selections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_version_id uuid NOT NULL REFERENCES public.shortlist_versions(id) ON DELETE CASCADE,
  catalog_product_id   uuid NOT NULL REFERENCES public.catalog_products(id),
  section_id           uuid REFERENCES public.shortlist_version_sections(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shortlist_version_id, catalog_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shortlist_accessory_selections_version
  ON public.shortlist_accessory_selections(shortlist_version_id);

ALTER TABLE public.shortlist_accessory_selections ENABLE ROW LEVEL SECURITY;

COMMIT;
