-- ─────────────────────────────────────────
-- WS-B: Make shortlist items polymorphic (plant_id OR catalog_product_id).
-- Existing rows all have plant_id NOT NULL, so the new CHECK is satisfied.
-- ─────────────────────────────────────────

-- Draft items
ALTER TABLE shortlist_draft_items
  ALTER COLUMN plant_id DROP NOT NULL;

ALTER TABLE shortlist_draft_items
  ADD COLUMN IF NOT EXISTS catalog_product_id uuid REFERENCES catalog_products(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shortlist_draft_items_one_ref'
  ) THEN
    ALTER TABLE shortlist_draft_items
      ADD CONSTRAINT shortlist_draft_items_one_ref CHECK (
        (plant_id IS NOT NULL)::int + (catalog_product_id IS NOT NULL)::int = 1
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shortlist_draft_items_catalog_product_idx
  ON shortlist_draft_items (catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;

-- Version items
ALTER TABLE shortlist_version_items
  ALTER COLUMN plant_id DROP NOT NULL;

ALTER TABLE shortlist_version_items
  ADD COLUMN IF NOT EXISTS catalog_product_id uuid REFERENCES catalog_products(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shortlist_version_items_one_ref'
  ) THEN
    ALTER TABLE shortlist_version_items
      ADD CONSTRAINT shortlist_version_items_one_ref CHECK (
        (plant_id IS NOT NULL)::int + (catalog_product_id IS NOT NULL)::int = 1
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shortlist_version_items_catalog_product_idx
  ON shortlist_version_items (catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;
