-- ─────────────────────────────────────────
-- PROFILES (extends auth.users 1:1)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  role        text NOT NULL DEFAULT 'admin'
              CHECK (role IN ('admin', 'horticulturist', 'gardener', 'customer')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- GARDENERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gardeners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  phone       text NOT NULL UNIQUE,
  pin_hash    text NOT NULL,
  is_active   boolean DEFAULT true,
  join_date   date,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- HORTICULTURISTS
-- Horticulturists have Supabase auth accounts (email OTP).
-- This table stores their operational metadata beyond what profiles holds.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horticulturists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email       text NOT NULL UNIQUE,
  is_active   boolean DEFAULT true,
  join_date   date,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- BALCONIES (one-to-many with customers)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS balconies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label             text NOT NULL DEFAULT 'Main balcony',
  direction         text CHECK (direction IN ('N','S','E','W','NE','NW','SE','SW')),
  pot_count         integer,
  sunlight_level    text CHECK (sunlight_level IN ('full','partial','shade')),
  wind_exposure     text CHECK (wind_exposure IN ('high','medium','low')),
  area_sqft         numeric,
  setup_notes       text,
  key_access_notes  text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- SERVICE PLANS
-- visit_frequency uses DB values: 'weekly' | 'fortnightly' | 'monthly'
-- UI displays 'Weekly' | 'Fortnightly' | 'Monthly' — always map to these DB values when saving.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_plans (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text,
  visit_frequency         text NOT NULL CHECK (visit_frequency IN ('weekly','fortnightly','monthly')),
  visit_duration_minutes  integer DEFAULT 60,
  price                   numeric NOT NULL,
  billing_cycle           text DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','quarterly')),
  includes_fertilizer     boolean DEFAULT true,
  includes_pest_control   boolean DEFAULT true,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now()
);

-- Seed standard plans immediately
INSERT INTO service_plans (name, description, visit_frequency, price) VALUES
  ('Starter',  '0–20 pots · fortnightly visits',  'fortnightly', 799),
  ('Growth',   '20–40 pots · fortnightly visits', 'fortnightly', 1099)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES service_plans(id),
  start_date      date NOT NULL,
  end_date        date,
  status          text DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  override_price  numeric,          -- for trial / custom pricing
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- SERVICE SLOTS (recurring schedule)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_slots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  gardener_id         uuid REFERENCES gardeners(id) ON DELETE SET NULL,
  day_of_week         integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon
  time_window_start   time NOT NULL,
  time_window_end     time NOT NULL,
  is_active           boolean DEFAULT true,
  effective_from      date NOT NULL DEFAULT CURRENT_DATE,
  effective_until     date,
  created_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- SERVICE VISITS
-- assigned_gardener_id: the gardener doing this specific visit.
-- Normally matches subscription.assigned_gardener_id but can differ for substitutions.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_visits (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES customers(id),
  subscription_id      uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  assigned_gardener_id uuid REFERENCES gardeners(id) ON DELETE SET NULL,
  slot_id              uuid REFERENCES service_slots(id) ON DELETE SET NULL,
  scheduled_date       date NOT NULL,
  time_window_start    time,
  time_window_end      time,
  started_at           timestamptz,
  completed_at         timestamptz,
  status               text DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled','in_progress','completed','missed','cancelled')),
  gardener_notes       text,
  ops_notes            text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- CHECKLIST TEMPLATE ITEMS (standard list)
-- `label` is the display text. `is_active` lets admin retire items without deletion.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,
  is_required boolean DEFAULT true,
  is_active   boolean DEFAULT true,
  order_index integer NOT NULL,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO checklist_template_items (label, is_required, is_active, order_index) VALUES
  ('Water all plants thoroughly',                        true,  true, 1),
  ('Remove dead leaves and spent flowers',               true,  true, 2),
  ('Prune overgrown or leggy stems',                     true,  true, 3),
  ('Inspect for pests (check undersides of leaves)',     true,  true, 4),
  ('Check soil moisture and drainage',                   true,  true, 5),
  ('Apply fertilizer if due',                            false, true, 6),
  ('Apply pest control treatment if due',                false, true, 7),
  ('Clean pots, saucers, and surrounding area',          true,  true, 8),
  ('Identify any diseased or dying plants',              true,  true, 9),
  ('Overall garden health assessment and notes',         true,  true, 10)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- VISIT CHECKLIST ITEMS (per visit)
-- Snapshot of template at the time of visit. label/is_required copied from template.
-- is_completed used everywhere in code (not `completed`).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_checklist_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            uuid NOT NULL REFERENCES service_visits(id) ON DELETE CASCADE,
  template_item_id    uuid REFERENCES checklist_template_items(id) ON DELETE SET NULL,
  label               text NOT NULL,
  is_required         boolean DEFAULT true,
  order_index         integer NOT NULL,
  is_completed        boolean DEFAULT false,
  completed_at        timestamptz,
  completed_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- VISIT PHOTOS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      uuid NOT NULL REFERENCES service_visits(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id),
  storage_path  text NOT NULL,
  caption       text,
  tag           text CHECK (tag IN ('before','after','issue','general')),
  taken_at      timestamptz,
  uploaded_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- CARE LOGS (fertilization + pest control)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS care_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id),
  balcony_id    uuid REFERENCES balconies(id) ON DELETE SET NULL,
  visit_id      uuid REFERENCES service_visits(id) ON DELETE SET NULL,
  log_type      text NOT NULL CHECK (log_type IN ('fertilization','pest_control')),
  product_name  text,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  applied_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  next_due_date date,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- ISSUES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          uuid REFERENCES service_visits(id) ON DELETE SET NULL,
  customer_id       uuid NOT NULL REFERENCES customers(id),
  balcony_id        uuid REFERENCES balconies(id) ON DELETE SET NULL,
  title             text NOT NULL,
  description       text,
  severity          text DEFAULT 'medium'
                    CHECK (severity IN ('low','medium','high','critical')),
  status            text DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','wont_fix')),
  assigned_to       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes  text,
  resolved_at       timestamptz,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  subscription_id  uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount           numeric NOT NULL,
  currency         text DEFAULT 'INR',
  payment_date     date NOT NULL,
  due_date         date,
  payment_mode     text CHECK (payment_mode IN ('upi','cash','bank_transfer','card')),
  reference_number text,
  status           text DEFAULT 'received'
                   CHECK (status IN ('received','pending','overdue','waived')),
  notes            text,
  recorded_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_balconies_customer_id      ON balconies(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id  ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_horticulturists_profile_id  ON horticulturists(profile_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_gardener_id  ON service_visits(assigned_gardener_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_customer_id ON service_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_status      ON service_visits(status);
CREATE INDEX IF NOT EXISTS idx_service_visits_scheduled   ON service_visits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_visit_checklist_visit_id   ON visit_checklist_items(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_visit_id      ON visit_photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_care_logs_customer_id      ON care_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_issues_customer_id         ON issues(customer_id);
CREATE INDEX IF NOT EXISTS idx_issues_status              ON issues(status);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id       ON payments(customer_id);

-- ─────────────────────────────────────────
-- NOTE: service_slots is pre-built for Week 3 (schedule generation).
-- No UI or API touches it this week — it will be populated by the scheduling feature.

-- NOTE: care_logs is pre-built for Week 3 (fertilisation + pest control tracking).
-- It will be written to automatically when a gardener marks those checklist items done.

-- ─────────────────────────────────────────
-- RLS (enable on all tables, service role bypasses)
-- All API routes use SUPABASE_SERVICE_ROLE_KEY — RLS will be tightened in a future sprint
-- ─────────────────────────────────────────
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gardeners                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE horticulturists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE balconies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_slots             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_visits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_checklist_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_photos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                  ENABLE ROW LEVEL SECURITY;
