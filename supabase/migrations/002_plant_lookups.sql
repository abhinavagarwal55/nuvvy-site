-- Create plant_categories lookup table
CREATE TABLE IF NOT EXISTS plant_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create light_conditions lookup table
CREATE TABLE IF NOT EXISTS light_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_plant_categories_slug ON plant_categories(slug);
CREATE INDEX IF NOT EXISTS idx_plant_categories_sort ON plant_categories(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_light_conditions_slug ON light_conditions(slug);
CREATE INDEX IF NOT EXISTS idx_light_conditions_sort ON light_conditions(sort_order, name);

-- Seed plant_categories with current catalog values
INSERT INTO plant_categories (name, slug, sort_order) VALUES
  ('Indoor plant', 'indoor-plant', 1),
  ('Flowering', 'flowering', 2),
  ('Creepers', 'creepers', 3),
  ('Aromatic', 'aromatic', 4),
  ('Fruit Plants', 'fruit-plants', 5),
  ('Vegetables', 'vegetables', 6)
ON CONFLICT (name) DO NOTHING;

-- Seed light_conditions with current catalog values
INSERT INTO light_conditions (name, slug, sort_order) VALUES
  ('Low bright indirect', 'low-bright-indirect', 1),
  ('Bright indirect', 'bright-indirect', 2),
  ('Medium indirect', 'medium-indirect', 3),
  ('Bright indirect to partial shade', 'bright-indirect-partial-shade', 4),
  ('Full sunlight (6-8 hours)', 'full-sunlight-6-8-hours', 5),
  ('Full- partial sunlight (4-6 hours)', 'full-partial-sunlight-4-6-hours', 6),
  ('Partial sunlight (4-6 hours)', 'partial-sunlight-4-6-hours', 7)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE plant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE light_conditions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to read (for internal app)
-- Writes are handled via admin client/service role only
CREATE POLICY "Allow authenticated read" ON plant_categories
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read" ON light_conditions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- No anon access
CREATE POLICY "No anon access" ON plant_categories
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No anon access" ON light_conditions
  FOR ALL
  USING (false)
  WITH CHECK (false);
