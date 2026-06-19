-- Cost & Profitability Tracking — see nuvvy-cost-tracking-prd.md §3.
--
-- Adds two tables:
--   staff_compensation — recurring monthly comp masters (the "carry-forward" source)
--   expenses           — universal cost ledger (operational + payroll-realized rows)
--
-- All changes are additive. Soft-delete only (HLD decision #8: no hard deletes);
-- relative storage paths only (HLD §6). Existing billing/revenue tables untouched.

BEGIN;

-- ─── 3.2 staff_compensation — recurring monthly comp masters ──────────────────
-- Defined first so expenses.compensation_id can reference it.
CREATE TABLE IF NOT EXISTS public.staff_compensation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_profile_id   uuid REFERENCES public.profiles(id),  -- links to People; NULL for non-People payees
  payee_name         text,                                  -- used when payee_profile_id IS NULL
  category           text NOT NULL,                         -- 'salary' | 'consultant' | 'overhead'
  monthly_amount_inr integer NOT NULL CHECK (monthly_amount_inr >= 0),
  is_active          boolean NOT NULL DEFAULT true,
  effective_from     date NOT NULL,                          -- first month this comp applies (month-start)
  notes              text,
  created_by         uuid NOT NULL REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deactivated_at     timestamptz,
  deactivated_by     uuid REFERENCES public.profiles(id),
  -- Exactly one payee identity:
  CONSTRAINT comp_one_payee CHECK (
    (payee_profile_id IS NOT NULL AND payee_name IS NULL) OR
    (payee_profile_id IS NULL AND payee_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comp_active
  ON public.staff_compensation (is_active, effective_from);

-- ─── 3.1 expenses — universal cost ledger ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category          text NOT NULL,
    -- Operational (domains 2 & 3): 'garden_input' | 'gardener_transport'
    --                              | 'plant_purchase' | 'plant_transport'
    -- Payroll (domain 1):          'salary' | 'consultant' | 'overhead'
  expense_month     date NOT NULL,                            -- first day of the month, e.g. 2026-06-01
  amount_inr        integer NOT NULL CHECK (amount_inr >= 0),
  description       text,                                     -- e.g. "Vermicompost 10kg", "June retainer"
  payee_profile_id  uuid REFERENCES public.profiles(id),      -- set when payee is a People person
  payee_name        text,                                     -- free-text payee when not in People
  compensation_id   uuid REFERENCES public.staff_compensation(id),  -- links a realized payroll row to its master; NULL for one-offs & operational
  is_paid           boolean NOT NULL DEFAULT false,
  paid_at           timestamptz,
  paid_by           uuid REFERENCES public.profiles(id),
  receipt_path      text,                                     -- relative storage path, NEVER a full URL
  status            text NOT NULL DEFAULT 'active',           -- 'active' | 'voided'
  voided_at         timestamptz,
  voided_by         uuid REFERENCES public.profiles(id),
  submitted_by      uuid NOT NULL REFERENCES public.profiles(id),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Helper grouping (derived in queries, not stored):
--   operational categories = garden_input, gardener_transport, plant_purchase, plant_transport
--   payroll categories     = salary, consultant, overhead
-- Visibility rule: payroll categories are ADMIN-ONLY (see PRD §6).

CREATE INDEX IF NOT EXISTS idx_expenses_month
  ON public.expenses (expense_month) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_expenses_category
  ON public.expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_comp_month
  ON public.expenses (compensation_id, expense_month);

COMMIT;
