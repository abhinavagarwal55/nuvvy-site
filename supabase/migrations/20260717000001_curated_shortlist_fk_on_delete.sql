-- Deleting a plant order must not be blocked by an order-scoped curated list.
-- Make shortlists.plant_order_id ON DELETE SET NULL so a hard order delete
-- unbinds (but preserves) the curated shortlist instead of erroring on the FK.

BEGIN;

ALTER TABLE public.shortlists DROP CONSTRAINT IF EXISTS shortlists_plant_order_id_fkey;
ALTER TABLE public.shortlists
  ADD CONSTRAINT shortlists_plant_order_id_fkey
  FOREIGN KEY (plant_order_id) REFERENCES public.plant_orders(id) ON DELETE SET NULL;

COMMIT;
