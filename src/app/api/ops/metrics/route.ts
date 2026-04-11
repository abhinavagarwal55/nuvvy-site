import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const RANGE_INTERVALS: Record<string, string> = {
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "7d": "7 days",
};

// GET /api/ops/metrics?range=24h — admin-only metrics dashboard data
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";
  const interval = RANGE_INTERVALS[range] ?? "24 hours";
  const bucket = range === "7d" ? "day" : "hour";

  const supabase = getSupabaseAdmin();

  // All queries in parallel
  const [headlineRes, trendsRes, routesRes, slowestRes, scatterRes] =
    await Promise.all([
      // Headline P50/P95
      supabase.rpc("perf_headline", { time_interval: interval }),

      // Time-bucketed trends
      supabase.rpc("perf_trends", {
        time_interval: interval,
        time_bucket: bucket,
      }),

      // Per-route aggregates
      supabase.rpc("perf_routes", { time_interval: interval }),

      // Slowest requests (always last 24h)
      supabase
        .from("perf_logs")
        .select(
          "route, method, total_ms, auth_ms, query_ms, query_count, status_code, created_at"
        )
        .eq("source", "server")
        .gte(
          "created_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        )
        .order("total_ms", { ascending: false })
        .limit(20),

      // Scatter data (server-side, sampled)
      supabase
        .from("perf_logs")
        .select("route, query_count, total_ms")
        .eq("source", "server")
        .gte(
          "created_at",
          new Date(
            Date.now() - (RANGE_INTERVALS[range] ? parseInt(interval) || 24 : 24) * 60 * 60 * 1000
          ).toISOString()
        )
        .not("query_count", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  // Parse headline — may be empty if no RPC, fall back to direct query
  let headline = {
    client_p50: 0,
    client_p95: 0,
    server_p50: 0,
    server_p95: 0,
    total_requests: 0,
  };

  if (headlineRes.data && headlineRes.data.length > 0) {
    const row = headlineRes.data[0];
    headline = {
      client_p50: row.client_p50 ?? 0,
      client_p95: row.client_p95 ?? 0,
      server_p50: row.server_p50 ?? 0,
      server_p95: row.server_p95 ?? 0,
      total_requests: row.total_requests ?? 0,
    };
  }

  return NextResponse.json({
    data: {
      headline,
      trends: trendsRes.data ?? [],
      routes: routesRes.data ?? [],
      slowest: slowestRes.data ?? [],
      scatter: scatterRes.data ?? [],
    },
  });
}
