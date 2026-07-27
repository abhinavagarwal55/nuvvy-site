-- On-Demand Service — Phase 1, part 1: customers, service_visits, service_plans.
-- See project prompt "On-Demand Service Implementation".
--
-- On-demand is a THIRD customer type (alongside care_plan | plant_only), NOT a
-- rename of the PRD's imagined 'subscription'/'ondemand' pair. On-demand
-- customers have no subscription row; each service is billed per hour.
--
-- Everything here is additive + idempotent (safe to re-run on a populated DB).
-- Existing rows all satisfy the new constraints (new columns default to the
-- historical shape: customer_type='care_plan', plan_type='subscription').

-- ─────────────────────────────────────────────────────────────
-- 1. customers — add 'ondemand' to customer_type + on-demand fields
-- ─────────────────────────────────────────────────────────────

-- Expand the customer_type CHECK (originally inline in 20260607162205; Postgres
-- named it customers_customer_type_check).
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IN ('care_plan', 'plant_only', 'ondemand'));

-- Acquisition source — only meaningful for on-demand customers (nullable).
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_source_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_source_check
  CHECK (source IS NULL OR source IN ('direct', 'aviha.ai', 'referral'));

-- On-demand customers may have no mobile on file (PRD: mobile optional).
ALTER TABLE public.customers ALTER COLUMN phone_number DROP NOT NULL;

-- Last-applied stamps, updated when an on-demand visit completes.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_fertilizer_applied_at   timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_neem_applied_at         timestamptz;
-- Set when an on-demand customer is converted to a care-plan subscriber.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS converted_to_subscription_at timestamptz;

CREATE INDEX IF NOT EXISTS customers_source_idx     ON public.customers (source);
CREATE INDEX IF NOT EXISTS customers_unit_number_idx ON public.customers (unit_number);

-- ─────────────────────────────────────────────────────────────
-- 2. service_visits — per-visit hours, on-demand plan ref, special tasks
-- ─────────────────────────────────────────────────────────────
-- service_visits.subscription_id is NULL for on-demand visits; plan_id carries
-- the on-demand plan whose hourly_rate is snapshotted at bill time.
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS estimated_hours    numeric(5,2);
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS actual_hours_spent numeric(5,2);
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS plan_id            uuid REFERENCES public.service_plans(id);
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS special_tasks      text;

ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_hours_check;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_hours_check
  CHECK (
    (estimated_hours    IS NULL OR estimated_hours    > 0) AND
    (actual_hours_spent IS NULL OR actual_hours_spent >= 0)
  );

-- ─────────────────────────────────────────────────────────────
-- 3. service_plans — plan_type / pricing_model / hourly_rate
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'subscription';
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'per_plant_count';
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(8,2);

-- On-demand plans have no visit cadence — relax the historical NOT NULL.
ALTER TABLE public.service_plans ALTER COLUMN visit_frequency DROP NOT NULL;

ALTER TABLE public.service_plans DROP CONSTRAINT IF EXISTS service_plans_plan_type_check;
ALTER TABLE public.service_plans
  ADD CONSTRAINT service_plans_plan_type_check
  CHECK (plan_type IN ('subscription', 'ondemand'));

ALTER TABLE public.service_plans DROP CONSTRAINT IF EXISTS service_plans_pricing_model_check;
ALTER TABLE public.service_plans
  ADD CONSTRAINT service_plans_pricing_model_check
  CHECK (pricing_model IN ('per_plant_count', 'per_hour'));

-- Subscription plans carry no hourly_rate; on-demand plans require a positive
-- hourly_rate + per_hour pricing. Existing subscription rows satisfy this
-- (plan_type defaults 'subscription', hourly_rate NULL).
ALTER TABLE public.service_plans DROP CONSTRAINT IF EXISTS service_plans_ondemand_rate_check;
ALTER TABLE public.service_plans
  ADD CONSTRAINT service_plans_ondemand_rate_check
  CHECK (
    (plan_type = 'subscription' AND hourly_rate IS NULL) OR
    (plan_type = 'ondemand'     AND hourly_rate > 0 AND pricing_model = 'per_hour')
  );

CREATE INDEX IF NOT EXISTS service_plans_plan_type_idx ON public.service_plans (plan_type);

-- Seed one active on-demand plan so services can be created out of the box.
-- price is NOT NULL on service_plans; for on-demand it mirrors hourly_rate.
INSERT INTO public.service_plans (name, description, plan_type, pricing_model, hourly_rate, price, is_active)
SELECT 'On-demand Standard', 'One-off garden care billed per hour', 'ondemand', 'per_hour', 500, 500, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_plans WHERE plan_type = 'ondemand' AND name = 'On-demand Standard'
);
