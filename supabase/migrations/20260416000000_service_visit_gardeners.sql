-- Junction table for assigning multiple gardeners to a service visit.
-- The primary/lead gardener remains in service_visits.assigned_gardener_id
-- for backward compatibility. This table tracks additional gardeners.
CREATE TABLE IF NOT EXISTS public.service_visit_gardeners (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  gardener_id     uuid NOT NULL REFERENCES public.gardeners(id) ON DELETE CASCADE,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  assigned_by     uuid REFERENCES public.profiles(id),
  CONSTRAINT service_visit_gardeners_pkey PRIMARY KEY (id),
  CONSTRAINT service_visit_gardeners_unique UNIQUE (service_id, gardener_id)
);

CREATE INDEX IF NOT EXISTS svg_service_idx ON public.service_visit_gardeners (service_id);
CREATE INDEX IF NOT EXISTS svg_gardener_idx ON public.service_visit_gardeners (gardener_id);

ALTER TABLE public.service_visit_gardeners ENABLE ROW LEVEL SECURITY;

-- Backfill: seed the junction table from existing assigned_gardener_id values
INSERT INTO public.service_visit_gardeners (service_id, gardener_id)
SELECT id, assigned_gardener_id
FROM public.service_visits
WHERE assigned_gardener_id IS NOT NULL
ON CONFLICT DO NOTHING;
