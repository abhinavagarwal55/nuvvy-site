-- Create internal_users table for access control
CREATE TABLE IF NOT EXISTS internal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'viewer')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_internal_users_email ON internal_users(email);
CREATE INDEX IF NOT EXISTS idx_internal_users_enabled ON internal_users(enabled) WHERE enabled = true;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_internal_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_internal_users_updated_at ON internal_users;
CREATE TRIGGER trigger_update_internal_users_updated_at
  BEFORE UPDATE ON internal_users
  FOR EACH ROW
  EXECUTE FUNCTION update_internal_users_updated_at();

-- Enable RLS
ALTER TABLE internal_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies: No public access via anon key
-- Only service role (admin client) can read/write
CREATE POLICY "No anon access" ON internal_users
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Example seed data (commented out - uncomment and modify after migration)
-- INSERT INTO internal_users (email, role, enabled) VALUES
--   ('admin@example.com', 'admin', true),
--   ('editor@example.com', 'editor', true);
