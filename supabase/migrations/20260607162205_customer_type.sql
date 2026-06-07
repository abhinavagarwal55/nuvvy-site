-- Customer Type (Care Plan vs Plant Order) — see nuvvy-customer-type-prd.md §3.
--
-- Adds one primary classification column to `customers` and a mirror "intended"
-- column to `leads`. `care_plan` is the superset (a care-plan subscriber can
-- also place plant orders); `plant_only` is a transactional plant buyer with no
-- subscription/visits/care/billing. Modelled as ONE enum, not two boolean flags.
--
-- Additive + idempotent: safe to re-run, safe on a populated DB. The
-- NOT NULL DEFAULT 'care_plan' backfills every existing customer to the
-- historical behaviour (everyone today is a subscriber) with no data migration.

-- 1. customers — the primary classification.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'care_plan'
    CHECK (customer_type IN ('care_plan', 'plant_only'));

CREATE INDEX IF NOT EXISTS customers_customer_type_idx
  ON public.customers (customer_type);

-- 2. leads — the INTENDED type, set during qualification, read at convert time.
-- Nullable, no default: a fresh lead may not know yet. The convert path defaults
-- to 'care_plan' when null but records the operator's explicit choice when set.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intended_customer_type text
    CHECK (intended_customer_type IS NULL OR intended_customer_type IN ('care_plan', 'plant_only'));
