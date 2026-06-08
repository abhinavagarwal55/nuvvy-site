-- Plant Order Pipeline & Procurement Split (V1.1)
-- See nuvvy-plant-order-pipeline-prd.md §7.
--
-- Splits the single tangled status into two layers:
--   • plant_orders.status      = customer-facing pipeline (operator-driven)
--   • plant_order_items.status = procurement/logistics only
-- and adds the front-of-funnel + follow-up mechanism.
--
-- CLEAN SLATE: the plant-order module is not in real use yet, so existing data
-- is disposable. We truncate the whole family first, then reshape on empty
-- tables — no status remap, no installed_at preservation, no parallel column.
-- Everything runs in one transaction.

BEGIN;

-- 7.1 Clear the slate. CASCADE clears FK-dependent rows; does NOT touch
-- customers (referenced-by, not referencing).
TRUNCATE TABLE
  public.invoice_items,
  public.invoices,
  public.procurement_price_log,
  public.plant_order_items,
  public.plant_orders,
  public.nursery_trips
RESTART IDENTITY CASCADE;

-- 7.2 plant_orders — customer pipeline + follow-up + shortlist link
ALTER TABLE public.plant_orders ADD COLUMN IF NOT EXISTS next_follow_up_at    date;
ALTER TABLE public.plant_orders ADD COLUMN IF NOT EXISTS closed_reason        text;  -- only set when status = 'no_longer_interested'
ALTER TABLE public.plant_orders ADD COLUMN IF NOT EXISTS shortlist_version_id uuid REFERENCES public.shortlist_versions(id);

-- Replace the status domain (no remap needed — table is empty).
ALTER TABLE public.plant_orders DROP CONSTRAINT IF EXISTS plant_orders_status_check;
ALTER TABLE public.plant_orders ALTER COLUMN status SET DEFAULT 'interested';
ALTER TABLE public.plant_orders ADD CONSTRAINT plant_orders_status_check
  CHECK (status IN (
    'interested','finalizing','confirmed','scheduled',
    'installed','invoiced','no_longer_interested'
  ));

ALTER TABLE public.plant_orders DROP CONSTRAINT IF EXISTS plant_orders_closed_reason_check;
ALTER TABLE public.plant_orders ADD CONSTRAINT plant_orders_closed_reason_check
  CHECK (closed_reason IS NULL OR closed_reason IN (
    'declined','went_cold','not_feasible','wrong_timing'
  ));

CREATE INDEX IF NOT EXISTS idx_plant_orders_follow_up ON public.plant_orders(next_follow_up_at);

-- 7.3 plant_order_items — procurement/logistics only. Install fact stays in
-- installed_at / install_service_id; the status enum is procurement-only.
ALTER TABLE public.plant_order_items DROP CONSTRAINT IF EXISTS plant_order_items_status_check;
ALTER TABLE public.plant_order_items ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.plant_order_items ADD CONSTRAINT plant_order_items_status_check
  CHECK (status IN ('pending','on_trip','procured','partial','deferred','cancelled'));

COMMIT;
