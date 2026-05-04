-- Backfill service_visit_gardeners for any service_visits whose primary
-- gardener was set but missing from the junction table. These were created
-- by generateServices() between the original junction-table migration
-- (20260416) and the fix that adds junction rows on insert. The gardener
-- "today" and "history" views filter via this table, so missing rows mean
-- the gardener cannot see services that admin/horti can.
INSERT INTO public.service_visit_gardeners (service_id, gardener_id)
SELECT sv.id, sv.assigned_gardener_id
FROM public.service_visits sv
WHERE sv.assigned_gardener_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_visit_gardeners svg
    WHERE svg.service_id = sv.id
      AND svg.gardener_id = sv.assigned_gardener_id
  )
ON CONFLICT DO NOTHING;
