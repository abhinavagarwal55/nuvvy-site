-- ============================================================
-- Nuvvy Ops Platform V1 — Schema Additions
-- Migration: 20260407100000_ops_v1_additions.sql
--
-- Adds all tables and columns required by the Ops Platform PRD
-- on top of the v2_foundation schema.
-- Designed to be safe to run multiple times (IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ─── 1. ENUM ADDITIONS ───────────────────────────────────────

-- Add DRAFT to customer lifecycle (existing enum is uppercase convention)
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'DRAFT';

-- ─── 2. NEW STANDALONE TABLES (no dependencies) ──────────────

-- 2a. Societies — dropdown for customer onboarding
CREATE TABLE IF NOT EXISTS public.societies (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT societies_pkey PRIMARY KEY (id)
);

-- 2b. Care action reference data (the 4 types with default intervals)
CREATE TABLE IF NOT EXISTS public.care_action_types (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  name                   text NOT NULL UNIQUE,
    -- 'fertilizer' | 'vermi_compost' | 'micro_nutrients' | 'neem_oil'
  default_frequency_days integer NOT NULL,
  created_at             timestamptz DEFAULT now(),
  CONSTRAINT care_action_types_pkey PRIMARY KEY (id)
);

-- 2c. System configuration (single-row or multi-key KV store)
CREATE TABLE IF NOT EXISTS public.system_config (
  key        text NOT NULL,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT system_config_pkey PRIMARY KEY (key)
);

-- 2d. Audit log — silent trail for critical actions, no UI in V1
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES public.profiles(id),
  actor_role   text NOT NULL,
  action       text NOT NULL,
    -- e.g. 'bill.marked_paid' | 'customer.deactivated' | 'gardener.pin_reset'
    --      'schedule.changed'  | 'plan.assigned'        | 'care_cycle.reset'
  target_table text NOT NULL,
  target_id    uuid NOT NULL,
  metadata     jsonb,         -- before/after snapshot or context
  ip_address   inet,          -- from request headers (esp. important for gardener JWT path)
  user_agent   text,
  created_at   timestamptz DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.audit_logs (target_table, target_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx  ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);

-- ─── 3. ALTER EXISTING TABLES ────────────────────────────────

-- 3a. Gardeners — add login_token (URL-based auth), PIN version, inactive tracking
ALTER TABLE public.gardeners
  ADD COLUMN IF NOT EXISTS login_token    text UNIQUE,
  ADD COLUMN IF NOT EXISTS inactive_since date,
  ADD COLUMN IF NOT EXISTS pin_version    integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS gardeners_login_token_idx ON public.gardeners (login_token)
  WHERE login_token IS NOT NULL;

-- 3b. Profiles — add ops lifecycle status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  ADD COLUMN IF NOT EXISTS inactive_since date;

-- 3c. Horticulturists — add inactive tracking (parallel to gardeners)
ALTER TABLE public.horticulturists
  ADD COLUMN IF NOT EXISTS inactive_since date;

-- 3d. Customers — add all onboarding fields required by PRD
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS society_id              uuid REFERENCES public.societies(id),
  ADD COLUMN IF NOT EXISTS plant_count_range       text
    CHECK (plant_count_range IN ('0_20', '20_40', '40_plus')),
  ADD COLUMN IF NOT EXISTS light_condition         text,
  ADD COLUMN IF NOT EXISTS watering_responsibility text[],  -- ['self','house_help','others']
  ADD COLUMN IF NOT EXISTS house_help_phone        text,
  ADD COLUMN IF NOT EXISTS garden_notes            text,
  ADD COLUMN IF NOT EXISTS deactivation_reason     text,
  ADD COLUMN IF NOT EXISTS deactivated_at          timestamptz,
  ADD COLUMN IF NOT EXISTS created_by              uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS customers_society_idx ON public.customers (society_id);

-- 3e. Service visits — add PRD-required fields
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS not_completed_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_reason  text,
  ADD COLUMN IF NOT EXISTS is_one_off           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by          uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz;

-- Extend status constraint to include 'not_completed' (PRD term alongside legacy 'missed')
ALTER TABLE public.service_visits
  DROP CONSTRAINT IF EXISTS service_visits_status_check;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_status_check
    CHECK (status = ANY (ARRAY[
      'scheduled', 'in_progress', 'completed',
      'not_completed', 'missed', 'cancelled'
    ]));

-- 3f. Visit checklist items — add 3-state completion (done/not_required/pending)
--     Existing boolean is_completed is preserved for backward compat
ALTER TABLE public.visit_checklist_items
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'pending'
    CHECK (completion_status IN ('pending', 'done', 'not_required'));

-- 3g. Checklist template items — add indoor/outdoor category
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('indoor', 'outdoor', 'general'));

-- ─── 4. NEW TABLES (depend on existing tables) ───────────────

-- 4a. Customer observations — horticulturist notes, editable, separate from core customer row
CREATE TABLE IF NOT EXISTS public.customer_observations (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  text        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_observations_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS customer_observations_customer_idx
  ON public.customer_observations (customer_id);

-- 4b. Customer photos — onboarding photos (separate from visit_photos)
CREATE TABLE IF NOT EXISTS public.customer_photos (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES public.customers(id),
  storage_path        text NOT NULL, -- relative path only, never full URL
  is_onboarding_photo boolean NOT NULL DEFAULT true,
  uploaded_by         uuid REFERENCES public.profiles(id),
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_photos_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS customer_photos_customer_idx ON public.customer_photos (customer_id);

-- 4c. Customer care schedules — anchored model (not rolling)
--     One row per customer per care action type.
--     cycle_anchor_date set by horticulturist at onboarding.
--     next_due = cycle_anchor_date + (floor((last_done - anchor) / freq) + 1) * freq
CREATE TABLE IF NOT EXISTS public.customer_care_schedules (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES public.customers(id),
  care_action_type_id  uuid NOT NULL REFERENCES public.care_action_types(id),
  cycle_anchor_date    date NOT NULL,
  next_due_date        date,          -- stored for query performance; derived from anchor
  last_done_date       date,
  last_done_service_id uuid REFERENCES public.service_visits(id),
  cycle_reset_by       uuid REFERENCES public.profiles(id),
  cycle_reset_at       timestamptz,
  CONSTRAINT customer_care_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT customer_care_schedules_unique UNIQUE (customer_id, care_action_type_id)
);
CREATE INDEX IF NOT EXISTS care_schedules_customer_idx
  ON public.customer_care_schedules (customer_id);
CREATE INDEX IF NOT EXISTS care_schedules_due_idx
  ON public.customer_care_schedules (next_due_date)
  WHERE next_due_date IS NOT NULL;

-- 4d. Service care actions — what happened to each care type in a specific visit
CREATE TABLE IF NOT EXISTS public.service_care_actions (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  service_id           uuid NOT NULL REFERENCES public.service_visits(id),
  care_action_type_id  uuid NOT NULL REFERENCES public.care_action_types(id),
  was_due              boolean NOT NULL, -- was it shown as due at the time of the visit?
  marked_done          boolean NOT NULL DEFAULT false,
  done_at              timestamptz,
  CONSTRAINT service_care_actions_pkey PRIMARY KEY (id),
  CONSTRAINT service_care_actions_unique UNIQUE (service_id, care_action_type_id)
);
CREATE INDEX IF NOT EXISTS service_care_actions_service_idx
  ON public.service_care_actions (service_id);

-- 4e. Service special tasks — horticulturist attaches tasks to an upcoming visit
CREATE TABLE IF NOT EXISTS public.service_special_tasks (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  for_service_id           uuid NOT NULL REFERENCES public.service_visits(id),
  created_after_service_id uuid REFERENCES public.service_visits(id), -- review that triggered it
  description              text NOT NULL,
  is_completed             boolean NOT NULL DEFAULT false,
  created_by               uuid REFERENCES public.profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_special_tasks_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS special_tasks_service_idx
  ON public.service_special_tasks (for_service_id);

-- 4f. Service voice notes — one optional voice note per service (from gardener)
CREATE TABLE IF NOT EXISTS public.service_voice_notes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  service_id    uuid NOT NULL REFERENCES public.service_visits(id),
  storage_path  text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_voice_notes_pkey PRIMARY KEY (id),
  CONSTRAINT service_voice_notes_one_per_service UNIQUE (service_id)
);

-- 4g. Requests — unified system for problems + service requests + other
--     Separate from `issues` table (legacy; different schema/semantics)
CREATE TABLE IF NOT EXISTS public.requests (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES public.customers(id),
  service_id       uuid REFERENCES public.service_visits(id),  -- null if standalone
  type             text NOT NULL
    CHECK (type IN ('problem', 'service_request', 'other')),
  description      text,
  status           text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution_type  text
    CHECK (resolution_type IN ('via_service', 'via_communication', 'monitoring')),
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.profiles(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requests_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS requests_customer_idx  ON public.requests (customer_id);
CREATE INDEX IF NOT EXISTS requests_status_idx    ON public.requests (status)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS requests_service_idx   ON public.requests (service_id)
  WHERE service_id IS NOT NULL;

-- 4h. Request photos
CREATE TABLE IF NOT EXISTS public.request_photos (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.requests(id),
  storage_path  text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_photos_pkey PRIMARY KEY (id)
);

-- 4i. Request voice notes
CREATE TABLE IF NOT EXISTS public.request_voice_notes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.requests(id),
  storage_path  text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_voice_notes_pkey PRIMARY KEY (id)
);

-- 4j. Bills — PRD billing model (separate from legacy payments table)
--     payments table is preserved for historical records
CREATE TABLE IF NOT EXISTS public.bills (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id),
  plan_id               uuid REFERENCES public.service_plans(id),  -- snapshot ref at bill time
  amount_inr            integer NOT NULL,  -- admin can override plan price
  billing_period_start  date NOT NULL,     -- e.g. 2026-04-01
  billing_period_end    date NOT NULL,     -- e.g. 2026-04-30
  due_date              date NOT NULL,
  -- status: 'pending' | 'paid'
  -- 'overdue' is derived on-read: due_date < today AND status = 'pending'
  -- Never stored directly to avoid background job dependency
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid')),
  paid_at               timestamptz,
  paid_by               uuid REFERENCES public.profiles(id),
  last_reminder_sent_at timestamptz,
  notes                 text,
  created_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS bills_customer_idx ON public.bills (customer_id);
CREATE INDEX IF NOT EXISTS bills_status_idx   ON public.bills (status, due_date);

-- ─── 5. SEED DATA ─────────────────────────────────────────────

-- Care action types (reference data — do not change names, they are used in code)
INSERT INTO public.care_action_types (name, default_frequency_days) VALUES
  ('fertilizer',     30),
  ('vermi_compost',  90),
  ('micro_nutrients', 30),
  ('neem_oil',       15)
ON CONFLICT (name) DO NOTHING;

-- System config defaults
INSERT INTO public.system_config (key, value) VALUES
  ('max_services_per_gardener_per_day', '8')
ON CONFLICT (key) DO NOTHING;

-- Standard checklist template (5 items per PRD Q2 resolution)
-- Category: 'indoor' or 'outdoor'
INSERT INTO public.checklist_template_items (label, category, is_required, is_active, order_index)
VALUES
  ('Pruning / Trimming',      'outdoor', false, true, 1),
  ('Soil Loosening',          'outdoor', false, true, 2),
  ('Cleaning / Wiping Leaves','indoor',  false, true, 3),
  ('Pest Inspection',         'indoor',  false, true, 4),
  ('General Cleanup',         'outdoor', false, true, 5)
ON CONFLICT DO NOTHING;

-- ─── 6. RLS ───────────────────────────────────────────────────
-- RLS is enabled on all new tables. All API routes use the service role key,
-- so no RLS policies are required in V1. This is consistent with the
-- v2_foundation approach. Policies can be added in V2 for direct client access.

ALTER TABLE public.societies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_action_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_observations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_photos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_care_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_care_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_special_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_voice_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_voice_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills                   ENABLE ROW LEVEL SECURITY;
