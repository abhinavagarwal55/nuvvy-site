-- General-purpose events (site visits, meetings, etc.) shown on the ops calendar
CREATE TABLE IF NOT EXISTS public.ops_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  event_date      date NOT NULL,
  time_start      time,
  time_end        time,
  notes           text,
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  cancellation_reason text,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_events_date_idx ON public.ops_events (event_date);
ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;
