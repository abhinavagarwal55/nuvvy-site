-- Curated List Templates (nuvvy-curated-templates-prd.md)
--
-- A reusable, customer-agnostic collection of plants and/or accessories a
-- horticulturist saves once and applies into a customer's DRAFT curated list as
-- a starting point. Snapshot-on-use: applying COPIES items into the draft — no
-- live link back. Soft-delete only (active → inactive).
--
-- ADDITIVE ONLY. No changes to any existing table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.curated_list_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curated_list_template_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id              uuid NOT NULL REFERENCES public.curated_list_templates(id) ON DELETE CASCADE,
  plant_id                 uuid REFERENCES public.plants(id),
  catalog_product_id       uuid REFERENCES public.catalog_products(id),
  quantity                 integer CHECK (quantity IS NULL OR quantity > 0),
  note                     text,
  why_picked_for_balcony   text,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- exactly one of plant_id / catalog_product_id (mirrors shortlist_*_items)
  CONSTRAINT curated_list_template_items_one_ref CHECK (
    (plant_id IS NOT NULL)::int + (catalog_product_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_curated_list_template_items_template
  ON public.curated_list_template_items(template_id);

CREATE INDEX IF NOT EXISTS idx_curated_list_templates_status
  ON public.curated_list_templates(status);

-- RLS on (service-role bypass, consistent with the other ops tables).
ALTER TABLE public.curated_list_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curated_list_template_items  ENABLE ROW LEVEL SECURITY;

COMMIT;
