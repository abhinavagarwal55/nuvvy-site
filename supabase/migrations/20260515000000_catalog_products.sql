-- ─────────────────────────────────────────
-- CATALOG_PRODUCTS — Amazon-affiliate accessories (WS-A)
-- Distinct entity from plants. Polymorphic shortlist support comes in WS-B.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text,
  category                text NOT NULL CHECK (category IN (
                            'pot',
                            'planter_box',
                            'grow_light',
                            'tool',
                            'soil_input',
                            'other'
                          )),
  source                  text NOT NULL DEFAULT 'amazon_affiliate'
                          CHECK (source IN ('amazon_affiliate', 'nuvvy_internal', 'other')),
  amazon_asin             text,
  amazon_url              text,
  price_inr               integer,
  price_snapshot_at       timestamptz,
  image_url               text,
  image_storage_url       text,
  thumbnail_url           text,
  thumbnail_storage_url   text,
  brand                   text,
  attributes              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','unavailable','inactive')),
  display_order           integer,
  notes_internal          text,
  created_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One ASIN per affiliate product
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_amazon_asin_unique
  ON catalog_products (amazon_asin)
  WHERE amazon_asin IS NOT NULL AND source = 'amazon_affiliate';

CREATE INDEX IF NOT EXISTS catalog_products_status_category_idx
  ON catalog_products (status, category, display_order);

CREATE INDEX IF NOT EXISTS catalog_products_updated_at_idx
  ON catalog_products (updated_at DESC);

-- Touch updated_at on row updates
CREATE OR REPLACE FUNCTION touch_catalog_products_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS catalog_products_set_updated_at ON catalog_products;
CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW EXECUTE FUNCTION touch_catalog_products_updated_at();

-- RLS: API uses service role; we also expose a read-only public policy
-- for anonymous reads of active products (used by /plantcatalog).
ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_products_public_read ON catalog_products;
CREATE POLICY catalog_products_public_read ON catalog_products
  FOR SELECT
  USING (status = 'active');
