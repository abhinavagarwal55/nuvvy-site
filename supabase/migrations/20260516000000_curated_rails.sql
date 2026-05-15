-- ─────────────────────────────────────────
-- CURATED RAILS — editorial collections on /plantcatalog (CE1)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curated_rails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  subtitle        text,
  segment         text NOT NULL CHECK (segment IN ('plants', 'accessories')),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','inactive')),
  display_order   integer NOT NULL DEFAULT 0,
  cta_label       text,
  cta_link        text,
  notes_internal  text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curated_rails_active_by_segment_idx
  ON curated_rails (segment, status, display_order);

CREATE TABLE IF NOT EXISTS curated_rail_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rail_id             uuid NOT NULL REFERENCES curated_rails(id) ON DELETE CASCADE,
  plant_id            uuid REFERENCES plants(id),
  catalog_product_id  uuid REFERENCES catalog_products(id),
  position            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curated_rail_items_one_ref CHECK (
    (plant_id IS NOT NULL)::int + (catalog_product_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS curated_rail_items_rail_idx
  ON curated_rail_items (rail_id, position);
CREATE INDEX IF NOT EXISTS curated_rail_items_plant_idx
  ON curated_rail_items (plant_id) WHERE plant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS curated_rail_items_product_idx
  ON curated_rail_items (catalog_product_id) WHERE catalog_product_id IS NOT NULL;

-- Touch updated_at on row update
CREATE OR REPLACE FUNCTION touch_curated_rails_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$$;

DROP TRIGGER IF EXISTS curated_rails_set_updated_at ON curated_rails;
CREATE TRIGGER curated_rails_set_updated_at
BEFORE UPDATE ON curated_rails
FOR EACH ROW EXECUTE FUNCTION touch_curated_rails_updated_at();

-- RLS
ALTER TABLE curated_rails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curated_rails_public_read ON curated_rails;
CREATE POLICY curated_rails_public_read ON curated_rails
  FOR SELECT USING (status = 'active');

ALTER TABLE curated_rail_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curated_rail_items_public_read ON curated_rail_items;
CREATE POLICY curated_rail_items_public_read ON curated_rail_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM curated_rails r WHERE r.id = rail_id AND r.status = 'active')
  );
