import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";

// GET /api/ops/dashboard/horticulturist
export const GET = withPerfLog('/api/ops/dashboard/horticulturist', async (request: NextRequest, ctx: PerfContext) => {
  let auth;
  try {
    auth = await ctx.trackAuth(() => requireOpsAuth(request));
  } catch (res) {
    return res as Response;
  }
  ctx.setUser(auth.userId, auth.role);
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  // This week range
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekFrom = fmt(monday);
  const weekTo = fmt(sunday);

  const [
    { count: unreviewedCount },
    { count: openRequests },
    { data: weekServices },
    { data: careSchedulesDue },
  ] = await ctx.trackQuery(async () => Promise.all([
    supabase
      .from("service_visits")
      .select("id", { count: "exact", head: true })
      .in("status", ["completed", "not_completed"])
      .is("reviewed_at", null),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
    supabase
      .from("service_visits")
      .select("id, status, scheduled_date")
      .gte("scheduled_date", weekFrom)
      .lte("scheduled_date", weekTo),
    supabase
      .from("customer_care_schedules")
      .select("care_action_type_id, next_due_date")
      .lte("next_due_date", weekTo)
      .gte("next_due_date", weekFrom),
  ]));

  // Group care actions due by type
  const careByType: Record<string, number> = {};
  for (const cs of careSchedulesDue ?? []) {
    careByType[cs.care_action_type_id] =
      (careByType[cs.care_action_type_id] ?? 0) + 1;
  }

  // Get type names
  let careTypeNames: Record<string, string> = {};
  const typeIds = Object.keys(careByType);
  if (typeIds.length > 0) {
    const { data: types } = await ctx.trackQuery(async () => supabase
      .from("care_action_types")
      .select("id, name")
      .in("id", typeIds));
    careTypeNames = Object.fromEntries(
      (types ?? []).map((t) => [t.id, t.name])
    );
  }

  const careActionsDue = Object.entries(careByType).map(([typeId, count]) => ({
    name: careTypeNames[typeId] ?? typeId,
    count,
  }));

  return NextResponse.json({
    data: {
      unreviewed_services: unreviewedCount ?? 0,
      open_requests: openRequests ?? 0,
      week_services_count: (weekServices ?? []).length,
      care_actions_due_this_week: careActionsDue,
    },
  });
});

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
