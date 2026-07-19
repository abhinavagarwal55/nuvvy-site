-- Curated list templates: split into PLANT vs ACCESSORY templates.
--
-- A template now carries a `type` so the curated-list editor can offer the right
-- set ("Add from template" for plants shows plant templates; for accessories,
-- accessory templates). Additive; backfills existing templates from their items.

BEGIN;

ALTER TABLE public.curated_list_templates
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'plants';

ALTER TABLE public.curated_list_templates DROP CONSTRAINT IF EXISTS curated_list_templates_type_check;
ALTER TABLE public.curated_list_templates ADD CONSTRAINT curated_list_templates_type_check
  CHECK (type IN ('plants','accessories'));

-- Backfill (idempotent): a template with accessory items and NO plant items is
-- an accessory template; everything else stays the default 'plants'.
UPDATE public.curated_list_templates t
SET type = 'accessories'
WHERE EXISTS (
        SELECT 1 FROM public.curated_list_template_items i
        WHERE i.template_id = t.id AND i.catalog_product_id IS NOT NULL
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.curated_list_template_items i
        WHERE i.template_id = t.id AND i.plant_id IS NOT NULL
      );

COMMIT;
