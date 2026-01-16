-- Add foreign key columns to plants table for category and light
-- Keep existing text columns for backward compatibility with public catalog

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES plant_categories(id),
  ADD COLUMN IF NOT EXISTS light_id uuid REFERENCES light_conditions(id);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_plants_category_id ON plants(category_id);
CREATE INDEX IF NOT EXISTS idx_plants_light_id ON plants(light_id);

-- Backfill category_id by matching existing category text to plant_categories.name
UPDATE plants p
SET category_id = pc.id
FROM plant_categories pc
WHERE p.category = pc.name
  AND p.category_id IS NULL;

-- Backfill light_id by matching existing light text to light_conditions.name
UPDATE plants p
SET light_id = lc.id
FROM light_conditions lc
WHERE p.light = lc.name
  AND p.light_id IS NULL;

-- Note: We keep category and light text columns for backward compatibility
-- The public catalog can continue using text values while internal admin uses IDs
