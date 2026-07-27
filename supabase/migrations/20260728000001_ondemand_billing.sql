-- On-Demand Service — Phase 1, part 2: extend `bills` for per-hour billing.
--
-- Decision (owner-confirmed): EXTEND the existing bills table rather than create
-- a second one. bills already models subscription period billing (amount_inr,
-- billing_period_*, due_date, status pending|paid). We add a `bill_type`
-- discriminator plus on-demand columns; on-demand bills reuse `amount_inr`
-- (rounded rupees) so there is a single amount surface across both types.
--
-- IMPORTANT: existing subscription billing queries must now filter
-- `bill_type = 'subscription'` so on-demand rows don't leak into subscription
-- views. The GET /api/ops/billing list is updated in this change set.
--
-- Additive + idempotent. Existing rows default to bill_type='subscription' and
-- satisfy every new constraint.

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS bill_type text NOT NULL DEFAULT 'subscription';
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_bill_type_check;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_bill_type_check CHECK (bill_type IN ('subscription', 'ondemand'));

-- On-demand: one bill per completed service visit.
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS service_visit_id uuid REFERENCES public.service_visits(id) ON DELETE CASCADE;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS hourly_rate        numeric(8,2);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS actual_hours_spent numeric(5,2);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS generated_at       timestamptz;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Period fields are subscription-only. On-demand bills leave them NULL.
ALTER TABLE public.bills ALTER COLUMN billing_period_start DROP NOT NULL;
ALTER TABLE public.bills ALTER COLUMN billing_period_end   DROP NOT NULL;
ALTER TABLE public.bills ALTER COLUMN due_date             DROP NOT NULL;
-- amount_inr stays NOT NULL: both bill types populate it.

-- Expand the status enum to the on-demand lifecycle (draft → pending_payment →
-- paid). Subscription bills continue to use pending|paid.
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_status_check
  CHECK (status IN ('pending', 'paid', 'draft', 'pending_payment'));

-- Shape integrity per type. Existing subscription rows have billing_period_start
-- + due_date set, so they pass the subscription branch.
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_type_shape_check;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_type_shape_check
  CHECK (
    (bill_type = 'subscription'
      AND billing_period_start IS NOT NULL
      AND due_date IS NOT NULL)
    OR
    (bill_type = 'ondemand'
      AND service_visit_id   IS NOT NULL
      AND hourly_rate        IS NOT NULL
      AND actual_hours_spent IS NOT NULL
      AND billing_period_start IS NULL)
  );

-- At most one bill per service visit.
CREATE UNIQUE INDEX IF NOT EXISTS bills_service_visit_uidx
  ON public.bills (service_visit_id) WHERE service_visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bills_bill_type_idx ON public.bills (bill_type);
