import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";

// GET /api/ops/schedule/services?customer_id=xxx&gardener_id=xxx&date_from=xxx&date_to=xxx&status=xxx
export const GET = withPerfLog('/api/ops/schedule/services', async (request: NextRequest, ctx: PerfContext) => {
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

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id");
  const gardenerId = searchParams.get("gardener_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const status = searchParams.get("status");

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("service_visits")
    .select(
      "id, customer_id, assigned_gardener_id, slot_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, is_one_off, not_completed_reason"
    )
    .order("scheduled_date", { ascending: true });

  if (customerId) query = query.eq("customer_id", customerId);
  if (gardenerId) query = query.eq("assigned_gardener_id", gardenerId);
  if (dateFrom) query = query.gte("scheduled_date", dateFrom);
  if (dateTo) query = query.lte("scheduled_date", dateTo);
  if (status) query = query.eq("status", status);

  const { data, error } = await ctx.trackQuery(async () => await query.limit(200));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer and gardener names
  const customerIds = [...new Set((data ?? []).map((s) => s.customer_id))];
  const gardenerIds = [
    ...new Set(
      (data ?? []).map((s) => s.assigned_gardener_id).filter(Boolean)
    ),
  ];

  let customerNames: Record<string, string> = {};
  let gardenerNames: Record<string, string> = {};

  if (customerIds.length > 0) {
    const { data: customers } = await ctx.trackQuery(async () => supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds));
    customerNames = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c.name])
    );
  }

  if (gardenerIds.length > 0) {
    const { data: gardeners } = await ctx.trackQuery(async () => supabase
      .from("gardeners")
      .select("id, name")
      .in("id", gardenerIds));
    gardenerNames = Object.fromEntries(
      (gardeners ?? []).map((g) => [g.id, g.name ?? "Unknown"])
    );
  }

  const services = (data ?? []).map((s) => ({
    ...s,
    customer_name: customerNames[s.customer_id] ?? "Unknown",
    gardener_name: s.assigned_gardener_id
      ? gardenerNames[s.assigned_gardener_id] ?? "Unknown"
      : null,
  }));

  return NextResponse.json({ data: services });
});
