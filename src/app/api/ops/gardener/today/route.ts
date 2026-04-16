import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";

// GET /api/ops/gardener/today — all services for this gardener today
export const GET = withPerfLog('/api/ops/gardener/today', async (request: NextRequest, ctx: PerfContext) => {
  let auth;
  try {
    auth = await ctx.trackAuth(() => requireOpsAuth(request));
  } catch (res) {
    return res as Response;
  }
  ctx.setUser(auth.userId, auth.role);

  // Gardener: use their gardener_id. Admin/horti: require ?gardener_id param
  let gardenerId = auth.gardener_id;
  if (!gardenerId) {
    const { searchParams } = new URL(request.url);
    gardenerId = searchParams.get("gardener_id");
    if (!gardenerId) {
      return NextResponse.json(
        { error: "gardener_id required for non-gardener users" },
        { status: 400 }
      );
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const supabase = getSupabaseAdmin();

  // Find all service IDs where this gardener is assigned (primary or secondary)
  const { data: junctionRows } = await ctx.trackQuery(async () => supabase
    .from("service_visit_gardeners")
    .select("service_id")
    .eq("gardener_id", gardenerId));
  const assignedServiceIds = (junctionRows ?? []).map((r) => r.service_id);

  const { data: services, error } = await ctx.trackQuery(async () => supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, is_one_off"
    )
    .in("id", assignedServiceIds.length > 0 ? assignedServiceIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("scheduled_date", today)
    .order("time_window_start", { ascending: true }));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer names
  const customerIds = [...new Set((services ?? []).map((s) => s.customer_id))];
  let customerNames: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await ctx.trackQuery(async () => supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds));
    customerNames = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c.name])
    );
  }

  const result = (services ?? []).map((s) => ({
    ...s,
    customer_name: customerNames[s.customer_id] ?? "Unknown",
  }));

  return NextResponse.json({ data: result });
});
