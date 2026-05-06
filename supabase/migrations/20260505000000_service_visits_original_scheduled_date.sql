-- Track the date a service was originally generated for, separate from
-- scheduled_date which can change when an admin reschedules the visit.
-- generateServices() uses original_scheduled_date for idempotency so a
-- rescheduled service doesn't trigger re-creation of the original date.
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS original_scheduled_date date;

-- Backfill: existing rows assume their scheduled_date IS the original date.
-- (For services that were rescheduled before this column existed, we'll fix
-- those individually in a follow-up cleanup based on audit_logs.)
UPDATE public.service_visits
SET original_scheduled_date = scheduled_date
WHERE original_scheduled_date IS NULL;

CREATE INDEX IF NOT EXISTS service_visits_slot_orig_date_idx
  ON public.service_visits (slot_id, original_scheduled_date);
