-- ─── Customer-centric gardener assignment ──────────────────────────────────
--
-- Makes "who tends this customer's garden" a first-class, editable fact on the
-- customer row (one primary + at most one secondary co-visit gardener), and adds
-- a durable per-service override flag so a voluntary primary change never
-- silently clobbers a deliberately hand-set service assignment.
--
-- See: Nuvvy_Tech and Product/nuvvy-gardener-assignment-prd.md
--
-- Invariant (enforced at the API layer): for every active service_slots row of a
-- customer, service_slots.gardener_id == customers.primary_gardener_id. The slot
-- field is a denormalised mirror of the canonical customer field.

-- 1. Customer canonical assignment columns.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS primary_gardener_id   uuid REFERENCES public.gardeners(id),
  ADD COLUMN IF NOT EXISTS secondary_gardener_id uuid REFERENCES public.gardeners(id);

-- 2. Per-service override flag. true once a service's gardener set is changed
--    individually (per-service /reassign or /gardeners add/remove, or a default
--    service deselected during a primary change). A voluntary primary change
--    skips customized services unless the operator opts them in; deactivation
--    reassignment ignores the flag entirely.
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS gardener_customized boolean NOT NULL DEFAULT false;

-- 3. Backfill customers.primary_gardener_id from each customer's active slot.
--    If a customer somehow has multiple active slots with different gardeners,
--    pick the most recently created one (DISTINCT ON ... ORDER BY created_at DESC)
--    — do not fail the migration. The skipped slots are reported via NOTICE below.
UPDATE public.customers AS c
SET primary_gardener_id = s.gardener_id
FROM (
  SELECT DISTINCT ON (customer_id) customer_id, gardener_id
  FROM public.service_slots
  WHERE is_active = true AND gardener_id IS NOT NULL
  ORDER BY customer_id, created_at DESC
) AS s
WHERE c.id = s.customer_id
  AND c.primary_gardener_id IS NULL;

-- Report (not fail) any customer with conflicting active slots that the
-- tie-break dropped, so the data inconsistency is visible in migration logs.
DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM (
    SELECT customer_id
    FROM public.service_slots
    WHERE is_active = true AND gardener_id IS NOT NULL
    GROUP BY customer_id
    HAVING count(DISTINCT gardener_id) > 1
  ) AS conflicts;

  IF conflict_count > 0 THEN
    RAISE NOTICE 'customer_gardener_assignment backfill: % customer(s) had multiple active slots with different gardeners; kept the most recent per customer.', conflict_count;
  END IF;
END $$;

-- Helpful indexes for the deactivation-impact lookups (customers by gardener).
CREATE INDEX IF NOT EXISTS customers_primary_gardener_idx
  ON public.customers (primary_gardener_id) WHERE primary_gardener_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_secondary_gardener_idx
  ON public.customers (secondary_gardener_id) WHERE secondary_gardener_id IS NOT NULL;

COMMENT ON COLUMN public.customers.primary_gardener_id IS
  'Canonical primary gardener. Mirrored onto all active service_slots.gardener_id and stamped on generated service_visits.assigned_gardener_id.';
COMMENT ON COLUMN public.customers.secondary_gardener_id IS
  'Optional co-visit gardener. Added to future/generated services via service_visit_gardeners; never written to assigned_gardener_id.';
COMMENT ON COLUMN public.service_visits.gardener_customized IS
  'true once this service''s gardener was set individually. Voluntary primary changes skip it by default; deactivation reassignment ignores it.';
