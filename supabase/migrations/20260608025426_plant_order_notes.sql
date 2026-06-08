-- Plant order: append-only notes timeline + nullable install target.
-- See nuvvy-plant-order-pipeline-prd.md §9.2 (reuse the Leads notes pattern).

BEGIN;

-- Install target is optional now — operators capture interest before a date is
-- known. No more auto-assigned due_date on create.
ALTER TABLE public.plant_orders ALTER COLUMN due_date DROP NOT NULL;

-- Append-only notes (mirrors public.lead_notes).
CREATE TABLE IF NOT EXISTS public.plant_order_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_order_id  uuid NOT NULL REFERENCES public.plant_orders(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_order_notes_order
  ON public.plant_order_notes(plant_order_id, created_at DESC);

ALTER TABLE public.plant_order_notes ENABLE ROW LEVEL SECURITY;

COMMIT;
