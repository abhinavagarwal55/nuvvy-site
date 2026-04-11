-- Performance logging table for server-side and client-side timing
CREATE TABLE IF NOT EXISTS public.perf_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL DEFAULT 'server',  -- 'server' | 'client'
  route         text NOT NULL,
  method        text NOT NULL,
  status_code   smallint NOT NULL,

  -- Server-side timing
  total_ms      numeric(8,1) NOT NULL,
  auth_ms       numeric(8,1),
  query_ms      numeric(8,1),
  query_count   smallint,

  -- Client-side timing
  ttfb_ms       numeric(8,1),
  transfer_ms   numeric(8,1),
  render_ms     numeric(8,1),
  total_user_ms numeric(8,1),

  -- Context
  user_id       uuid,
  role          text,
  page          text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_perf_logs_route_created ON public.perf_logs (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_logs_created ON public.perf_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_logs_source_created ON public.perf_logs (source, created_at DESC);

-- RLS (service role access only, like other ops tables)
ALTER TABLE public.perf_logs ENABLE ROW LEVEL SECURITY;

-- Retention: delete rows older than 30 days daily at 3 AM
-- NOTE: Requires pg_cron extension enabled in Supabase Dashboard > Database > Extensions.
-- If pg_cron is not enabled, run this manually after enabling:
-- SELECT cron.schedule(
--   'perf-logs-cleanup',
--   '0 3 * * *',
--   $$DELETE FROM public.perf_logs WHERE created_at < now() - interval '30 days'$$
-- );
