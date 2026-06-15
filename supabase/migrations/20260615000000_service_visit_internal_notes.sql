-- Internal (team-only) notes for a service visit.
--
-- Context: horticulturists attach customer-facing "special tasks" to an upcoming
-- visit, and those task descriptions are externalised in the customer WhatsApp
-- reminder. They also need a place for notes that should NOT reach the customer
-- (e.g. "customer sensitive about X", "watch the money plant for pests") but
-- that the gardener and office should see.
--
-- This column holds that internal note, one per visit. It is shown on the
-- gardener execution screen and the horticulturist review page, but is never
-- read by the reminder feature (which only pulls service_special_tasks.description).
--
-- Distinct from the dormant `ops_notes` / `gardener_notes` columns, which are not
-- wired into any UI.

ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN public.service_visits.internal_notes IS
  'Team-only notes for this visit (gardener + horticulturist + admin). Never sent to the customer / reminder.';
