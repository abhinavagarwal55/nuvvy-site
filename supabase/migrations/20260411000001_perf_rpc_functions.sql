-- RPC functions for perf metrics dashboard aggregation

-- Headline: P50/P95 for client and server within a time range
CREATE OR REPLACE FUNCTION perf_headline(time_interval text)
RETURNS TABLE (
  client_p50 numeric,
  client_p95 numeric,
  server_p50 numeric,
  server_p95 numeric,
  total_requests bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) FROM perf_logs WHERE source = 'client' AND created_at > now() - time_interval::interval) AS client_p50,
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) FROM perf_logs WHERE source = 'client' AND created_at > now() - time_interval::interval) AS client_p95,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) FROM perf_logs WHERE source = 'server' AND created_at > now() - time_interval::interval) AS server_p50,
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) FROM perf_logs WHERE source = 'server' AND created_at > now() - time_interval::interval) AS server_p95,
    (SELECT count(*) FROM perf_logs WHERE created_at > now() - time_interval::interval) AS total_requests;
$$;

-- Trends: time-bucketed P50/P95 by route and source
CREATE OR REPLACE FUNCTION perf_trends(time_interval text, time_bucket text)
RETURNS TABLE (
  bucket timestamptz,
  route text,
  source text,
  p50 numeric,
  p95 numeric,
  count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    date_trunc(time_bucket, created_at) AS bucket,
    route,
    source,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95,
    count(*) AS count
  FROM perf_logs
  WHERE created_at > now() - time_interval::interval
  GROUP BY date_trunc(time_bucket, created_at), route, source
  ORDER BY bucket;
$$;

-- Routes: per-route aggregates
CREATE OR REPLACE FUNCTION perf_routes(time_interval text)
RETURNS TABLE (
  route text,
  source text,
  p50 numeric,
  p95 numeric,
  avg_auth_ms numeric,
  avg_query_ms numeric,
  avg_query_count numeric,
  avg_ttfb_ms numeric,
  avg_transfer_ms numeric,
  avg_render_ms numeric,
  count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    route,
    source,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95,
    avg(auth_ms) AS avg_auth_ms,
    avg(query_ms) AS avg_query_ms,
    avg(query_count)::numeric AS avg_query_count,
    avg(ttfb_ms) AS avg_ttfb_ms,
    avg(transfer_ms) AS avg_transfer_ms,
    avg(render_ms) AS avg_render_ms,
    count(*) AS count
  FROM perf_logs
  WHERE created_at > now() - time_interval::interval
  GROUP BY route, source
  ORDER BY count DESC;
$$;
