"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Headline = {
  client_p50: number;
  client_p95: number;
  server_p50: number;
  server_p95: number;
  total_requests: number;
};

type TrendPoint = {
  bucket: string;
  route: string;
  source: string;
  p50: number;
  p95: number;
  count: number;
};

type RouteAggregate = {
  route: string;
  source: string;
  p50: number;
  p95: number;
  avg_auth_ms: number | null;
  avg_query_ms: number | null;
  avg_query_count: number | null;
  avg_ttfb_ms: number | null;
  avg_transfer_ms: number | null;
  avg_render_ms: number | null;
  count: number;
};

type SlowestEntry = {
  route: string;
  method: string;
  total_ms: number;
  auth_ms: number | null;
  query_ms: number | null;
  query_count: number | null;
  status_code: number;
  created_at: string;
};

type ScatterPoint = {
  route: string;
  query_count: number;
  total_ms: number;
};

type MetricsData = {
  headline: Headline;
  trends: TrendPoint[];
  routes: RouteAggregate[];
  slowest: SlowestEntry[];
  scatter: ScatterPoint[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGES = ["1h", "6h", "24h", "7d"] as const;
const FOREST = "#2D5A3D";
const GARDEN = "#4A7C5F";
const SAGE = "#8BAF8A";
const TERRA = "#B5654A";
const ROUTE_COLORS = [FOREST, TERRA, GARDEN, SAGE, "#6B8E7B", "#C4836A", "#5A7A6A"];

function shortRoute(route: string): string {
  return route.replace("/api/ops/", "").replace("/api/internal/", "int/");
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms)}ms`;
}

function thresholdColor(ms: number): string {
  if (ms < 500) return "border-green-500";
  if (ms < 1500) return "border-yellow-500";
  return "border-red-500";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("24h");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/metrics?range=${range}`);
      if (!res.ok) {
        const json = await res.json();
        if (res.status === 403) {
          setError("Admin access required");
        } else {
          setError(json.error ?? "Failed to load metrics");
        }
        return;
      }
      const json = await res.json();
      setData(json.data);
    } catch {
      setError("Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  // Mobile guard
  return (
    <>
      <div className="md:hidden min-h-screen bg-cream flex items-center justify-center px-6">
        <p className="text-sm text-sage text-center">
          View on desktop for the metrics dashboard.
        </p>
      </div>
      <div className="hidden md:block min-h-screen bg-cream pb-12">
        <div className="bg-offwhite border-b border-stone px-6 pt-6 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-[1200px] mx-auto">
            <h1
              className="text-2xl text-charcoal"
              style={{
                fontFamily: "var(--font-cormorant, serif)",
                fontWeight: 500,
              }}
            >
              Performance Metrics
            </h1>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    range === r
                      ? "bg-forest text-offwhite"
                      : "border border-stone text-charcoal hover:bg-cream"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pt-6 max-w-[1200px] mx-auto space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-forest" />
            </div>
          )}

          {error && (
            <div className="bg-terra/10 text-terra rounded-2xl p-6 text-sm">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <Section1UserExperience data={data} />
              <Section2ServerPerformance data={data} />
              <Section3HealthIndicators data={data} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Section 1: User Experience ───────────────────────────────────────────────

function Section1UserExperience({ data }: { data: MetricsData }) {
  const clientRoutes = data.routes.filter((r) => r.source === "client");
  const clientTrends = data.trends.filter((t) => t.source === "client");

  // Group trends by bucket for LineChart
  const buckets = [...new Set(clientTrends.map((t) => t.bucket))].sort();
  const trendRoutes = [...new Set(clientTrends.map((t) => t.route))];
  const trendData = buckets.map((b) => {
    const point: Record<string, unknown> = {
      bucket: new Date(b).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
    for (const route of trendRoutes) {
      const match = clientTrends.find((t) => t.bucket === b && t.route === route);
      point[`${shortRoute(route)}_p50`] = match?.p50 ?? null;
      point[`${shortRoute(route)}_p95`] = match?.p95 ?? null;
    }
    return point;
  });

  // Bar chart data for TTFB/Transfer/Render breakdown
  const breakdownData = clientRoutes.map((r) => ({
    route: shortRoute(r.route),
    TTFB: Math.round(r.avg_ttfb_ms ?? 0),
    Transfer: Math.round(r.avg_transfer_ms ?? 0),
    Render: Math.round(r.avg_render_ms ?? 0),
  }));

  return (
    <DashCard title="User Experience">
      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <HeadlineCard label="P50 User Latency" ms={data.headline.client_p50} />
        <HeadlineCard label="P95 User Latency" ms={data.headline.client_p95} />
      </div>

      {/* Trend line chart */}
      {trendData.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Latency Trend</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#8BAF8A" }} unit="ms" />
              <Tooltip />
              <Legend />
              {trendRoutes.map((route, i) => (
                <Line
                  key={`${route}_p50`}
                  type="monotone"
                  dataKey={`${shortRoute(route)}_p50`}
                  stroke={ROUTE_COLORS[i % ROUTE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={`${shortRoute(route)} P50`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown bar chart */}
      {breakdownData.length > 0 && (
        <div>
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Latency Breakdown by Page</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={breakdownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
              <XAxis dataKey="route" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#8BAF8A" }} unit="ms" />
              <Tooltip />
              <Legend />
              <Bar dataKey="TTFB" stackId="a" fill={FOREST} />
              <Bar dataKey="Transfer" stackId="a" fill={GARDEN} />
              <Bar dataKey="Render" stackId="a" fill={SAGE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {clientRoutes.length === 0 && (
        <p className="text-sm text-stone">No client-side data yet for this time range.</p>
      )}
    </DashCard>
  );
}

// ─── Section 2: Server Performance ────────────────────────────────────────────

function Section2ServerPerformance({ data }: { data: MetricsData }) {
  const serverRoutes = data.routes.filter((r) => r.source === "server");

  const p50p95Data = serverRoutes.map((r) => ({
    route: shortRoute(r.route),
    P50: Math.round(r.p50),
    P95: Math.round(r.p95),
  }));

  const breakdownData = serverRoutes.map((r) => {
    const auth = Math.round(r.avg_auth_ms ?? 0);
    const query = Math.round(r.avg_query_ms ?? 0);
    const other = Math.max(0, Math.round(r.p50) - auth - query);
    return { route: shortRoute(r.route), Auth: auth, Query: query, Other: other };
  });

  return (
    <DashCard title="Server Performance">
      {/* P50/P95 grouped bar chart */}
      {p50p95Data.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-sage uppercase tracking-widest mb-2">P50 / P95 by Route</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={p50p95Data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
              <XAxis dataKey="route" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#8BAF8A" }} unit="ms" />
              <Tooltip />
              <Legend />
              <Bar dataKey="P50" fill={FOREST} />
              <Bar dataKey="P95" fill={TERRA} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time breakdown stacked bar */}
      {breakdownData.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Time Breakdown by Route</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={breakdownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
              <XAxis dataKey="route" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#8BAF8A" }} unit="ms" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Auth" stackId="a" fill={FOREST} />
              <Bar dataKey="Query" stackId="a" fill={GARDEN} />
              <Bar dataKey="Other" stackId="a" fill={SAGE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Slowest requests table */}
      {data.slowest.length > 0 && (
        <div>
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Slowest Requests (24h)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}>
              <thead>
                <tr className="border-b border-stone text-sage">
                  <th className="text-left py-2 pr-3">Route</th>
                  <th className="text-left py-2 pr-3">Method</th>
                  <th className="text-right py-2 pr-3">Total</th>
                  <th className="text-right py-2 pr-3">Auth</th>
                  <th className="text-right py-2 pr-3">Query</th>
                  <th className="text-right py-2 pr-3">Queries</th>
                  <th className="text-right py-2 pr-3">Status</th>
                  <th className="text-right py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.slowest.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-stone/20 ${
                      (row.query_count ?? 0) > 3 ? "bg-terra/5" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3 text-charcoal">{shortRoute(row.route)}</td>
                    <td className="py-1.5 pr-3 text-sage">{row.method}</td>
                    <td className="py-1.5 pr-3 text-right font-medium text-charcoal">{fmtMs(row.total_ms)}</td>
                    <td className="py-1.5 pr-3 text-right text-sage">{fmtMs(row.auth_ms)}</td>
                    <td className="py-1.5 pr-3 text-right text-sage">{fmtMs(row.query_ms)}</td>
                    <td className="py-1.5 pr-3 text-right text-sage">{row.query_count ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right text-sage">{row.status_code}</td>
                    <td className="py-1.5 text-right text-stone">
                      {new Date(row.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {serverRoutes.length === 0 && (
        <p className="text-sm text-stone">No server-side data yet for this time range.</p>
      )}
    </DashCard>
  );
}

// ─── Section 3: Health Indicators ─────────────────────────────────────────────

function Section3HealthIndicators({ data }: { data: MetricsData }) {
  const serverRoutes = data.routes.filter((r) => r.source === "server");
  const uniqueScatterRoutes = [...new Set(data.scatter.map((s) => s.route))];

  // Volume by route (sorted desc)
  const volumeData = serverRoutes
    .map((r) => ({ route: shortRoute(r.route), count: r.count }))
    .sort((a, b) => b.count - a.count);

  return (
    <DashCard title="Health Indicators">
      <div className="grid grid-cols-2 gap-6">
        {/* Scatter: query count vs response time */}
        <div>
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Query Count vs Response Time</p>
          {data.scatter.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
                <XAxis dataKey="query_count" name="Queries" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
                <YAxis dataKey="total_ms" name="Response (ms)" tick={{ fontSize: 10, fill: "#8BAF8A" }} unit="ms" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Legend />
                {uniqueScatterRoutes.map((route, i) => (
                  <Scatter
                    key={route}
                    name={shortRoute(route)}
                    data={data.scatter.filter((s) => s.route === route)}
                    fill={ROUTE_COLORS[i % ROUTE_COLORS.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-stone">No scatter data yet.</p>
          )}
        </div>

        {/* Volume by route */}
        <div>
          <p className="text-xs text-sage uppercase tracking-widest mb-2">Request Volume by Route</p>
          {volumeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={volumeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#D8CCBA" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#8BAF8A" }} />
                <YAxis dataKey="route" type="category" tick={{ fontSize: 10, fill: "#8BAF8A" }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill={FOREST}>
                  {volumeData.map((_, i) => (
                    <Cell key={i} fill={ROUTE_COLORS[i % ROUTE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-stone">No volume data yet.</p>
          )}
        </div>
      </div>
    </DashCard>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function DashCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-offwhite rounded-2xl p-6 shadow-sm">
      <h2
        className="text-lg text-charcoal mb-4"
        style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function HeadlineCard({ label, ms }: { label: string; ms: number }) {
  const rounded = Math.round(ms);
  const borderColor = thresholdColor(rounded);
  return (
    <div className={`bg-offwhite rounded-2xl border-l-4 ${borderColor} p-4`}>
      <p className="text-xs text-sage mb-1">{label}</p>
      <p className="text-2xl font-medium text-charcoal">{rounded > 0 ? `${rounded}ms` : "—"}</p>
    </div>
  );
}
