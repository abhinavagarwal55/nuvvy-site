-- Plant Order Management Module — all 6 tables

-- ─── 1. Nursery Trips (must be created before plant_order_items references it) ──
CREATE TABLE IF NOT EXISTS public.nursery_trips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_date       date NOT NULL,
  nursery_name    text,
  trip_owner_id   uuid NOT NULL REFERENCES auth.users(id),
  status          text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','completed','cancelled')),
  notes           text,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Plant Orders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id),
  status          text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','trip_assigned','procured','installed','cancelled')),
  request_source  text NOT NULL DEFAULT 'customer_requested'
    CHECK (request_source IN ('customer_requested','replacement')),
  due_date        date NOT NULL,
  notes           text,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Plant Order Items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_order_id      uuid NOT NULL REFERENCES public.plant_orders(id) ON DELETE CASCADE,
  plant_id            text,
  plant_name          text NOT NULL,
  quantity            int NOT NULL CHECK (quantity > 0),
  note                text,
  status              text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','trip_assigned','procured','installed','cancelled','deferred')),
  nursery_trip_id     uuid REFERENCES public.nursery_trips(id),
  qty_procured        int,
  actual_unit_price   numeric(10,2),
  procurement_date    date,
  nursery_name        text,
  installed_at        timestamptz,
  install_service_id  uuid REFERENCES public.service_visits(id),
  cancellation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Invoices ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  text NOT NULL UNIQUE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id),
  plant_order_id  uuid REFERENCES public.plant_orders(id),
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','finalized','paid','cancelled')),
  subtotal        numeric(10,2) NOT NULL DEFAULT 0,
  discount        numeric(10,2) NOT NULL DEFAULT 0,
  total           numeric(10,2) NOT NULL DEFAULT 0,
  notes           text,
  pdf_path        text,
  finalized_at    timestamptz,
  paid_at         timestamptz,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. Invoice Items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description          text NOT NULL,
  quantity             numeric(10,2) NOT NULL DEFAULT 1,
  unit_price           numeric(10,2) NOT NULL DEFAULT 0,
  total                numeric(10,2) NOT NULL DEFAULT 0,
  plant_order_item_id  uuid REFERENCES public.plant_order_items(id),
  sort_order           int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Procurement Price Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_price_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id             text,
  plant_name           text NOT NULL,
  unit_price           numeric(10,2) NOT NULL,
  nursery_name         text,
  logged_at            timestamptz NOT NULL DEFAULT now(),
  plant_order_item_id  uuid REFERENCES public.plant_order_items(id)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plant_orders_customer ON public.plant_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_plant_orders_status ON public.plant_orders(status);
CREATE INDEX IF NOT EXISTS idx_plant_orders_due_date ON public.plant_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_plant_order_items_order ON public.plant_order_items(plant_order_id);
CREATE INDEX IF NOT EXISTS idx_plant_order_items_trip ON public.plant_order_items(nursery_trip_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_plant_order ON public.invoices(plant_order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_procurement_price_log_plant ON public.procurement_price_log(plant_id);

-- ─── RLS (service role bypass, consistent with existing ops tables) ─────────
ALTER TABLE public.plant_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursery_trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_price_log   ENABLE ROW LEVEL SECURITY;
