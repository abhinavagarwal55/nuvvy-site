-- ─── Scoped Billing access for horticulturists ─────────────────────────────
--
-- A per-user boolean that lets an admin grant a specific horticulturist access
-- to the Billing module's invoicing actions (Care Plans + Plant Orders) WITHOUT
-- exposing revenue totals, payroll/overheads, or the summary tab.
--
-- No new role and no change to the profiles.role CHECK constraint: admins always
-- have full billing; gardeners/customers never; only role='horticulturist'
-- consults this flag. Enforcement is server-side (requireBillingAccess).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_access_billing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_access_billing IS
  'When true, a horticulturist may use the Billing invoicing actions (Care Plans + Plant Orders) but never sees revenue totals, payroll, or the summary tab. Ignored for admin (always full) and gardener/customer (never). Admin-only to set.';
