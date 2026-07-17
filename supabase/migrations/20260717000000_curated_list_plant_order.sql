-- Curated Plant List ↔ Plant Order coupling (nuvvy-curated-list-plant-order-prd.md)
--
-- Binds a legacy shortlist (the "curated plant list") 1:1 to a plant order.
-- The horticulturist builds it from inside an order, sends the /s/[token] link,
-- and on customer confirmation the order advances + the confirmed PLANT items
-- materialize into plant_order_items.
--
-- ADDITIVE ONLY. No enum changes, no destructive changes. /internal/shortlists
-- (legacy CMS path) is unaffected — every new column is nullable / defaulted.

BEGIN;

-- ── plant_orders — curated-list link + confirmation stamp ────────────────────
ALTER TABLE public.plant_orders
  ADD COLUMN IF NOT EXISTS curated_shortlist_id       uuid REFERENCES public.shortlists(id),
  ADD COLUMN IF NOT EXISTS curated_list_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS curated_list_confirmed_via text;

CREATE INDEX IF NOT EXISTS idx_plant_orders_curated_shortlist
  ON public.plant_orders(curated_shortlist_id)
  WHERE curated_shortlist_id IS NOT NULL;

-- ── plant_order_items — manual vs curated provenance ─────────────────────────
-- Manual entry (default) and curated items coexist on the same order. Reconcile
-- on re-confirmation is scoped to source='curated' rows only.
ALTER TABLE public.plant_order_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_shortlist_version_item_id uuid;

ALTER TABLE public.plant_order_items DROP CONSTRAINT IF EXISTS plant_order_items_source_check;
ALTER TABLE public.plant_order_items ADD CONSTRAINT plant_order_items_source_check
  CHECK (source IN ('manual','curated'));

CREATE INDEX IF NOT EXISTS idx_plant_order_items_source
  ON public.plant_order_items(plant_order_id, source);

-- ── shortlists — back-reference to the originating plant order ───────────────
-- NULL for legacy CMS-created shortlists (/internal/shortlists).
ALTER TABLE public.shortlists
  ADD COLUMN IF NOT EXISTS plant_order_id uuid REFERENCES public.plant_orders(id);

CREATE INDEX IF NOT EXISTS idx_shortlists_plant_order
  ON public.shortlists(plant_order_id)
  WHERE plant_order_id IS NOT NULL;

COMMIT;
