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

  // When filtering by gardener, include services where they are primary OR secondary
  let gardenerServiceIds: string[] | null = null;
  if (gardenerId) {
    const { data: junctionRows } = await ctx.trackQuery(async () => supabase
      .from("service_visit_gardeners")
      .select("service_id")
      .eq("gardener_id", gardenerId));
    gardenerServiceIds = (junctionRows ?? []).map((r) => r.service_id);
  }

  let query = supabase
    .from("service_visits")
    .select(
      "id, customer_id, assigned_gardener_id, slot_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, is_one_off, not_completed_reason"
    )
    .order("scheduled_date", { ascending: true });

  if (customerId) query = query.eq("customer_id", customerId);
  if (gardenerId && gardenerServiceIds) {
    // Filter to services where this gardener is assigned (primary or secondary)
    query = query.in("id", gardenerServiceIds.length > 0 ? gardenerServiceIds : ["00000000-0000-0000-0000-000000000000"]);
  }
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
      .select("id, profile_id")
      .in("id", gardenerIds));
    const profileIds = (gardeners ?? [])
      .map((g) => g.profile_id)
      .filter(Boolean);
    if (profileIds.length > 0) {
      const { data: profiles } = await ctx.trackQuery(async () => supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds));
      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
      );
      gardenerNames = Object.fromEntries(
        (gardeners ?? []).map((g) => [
          g.id,
          g.profile_id ? profileMap[g.profile_id] ?? "Unknown" : "Unknown",
        ])
      );
    }
  }

  // Resolve plan visit_duration_minutes per customer via the active subscription.
  // Batched (no N+1): active subscriptions for these customers -> their plans.
  const durationByCustomer: Record<string, number> = {};
  if (customerIds.length > 0) {
    const { data: subs } = await ctx.trackQuery(async () => supabase
      .from("subscriptions")
      .select("customer_id, plan_id, created_at")
      .in("customer_id", customerIds)
      .eq("status", "active")
      .order("created_at", { ascending: false }));
    // Keep the latest active subscription per customer (rows are desc by created_at)
    const planByCustomer: Record<string, string> = {};
    for (const sub of subs ?? []) {
      if (!sub.plan_id) continue;
      if (!(sub.customer_id in planByCustomer)) planByCustomer[sub.customer_id] = sub.plan_id;
    }
    const planIds = [...new Set(Object.values(planByCustomer))];
    let planDurations: Record<string, number> = {};
    if (planIds.length > 0) {
      const { data: plans } = await ctx.trackQuery(async () => supabase
        .from("service_plans")
        .select("id, visit_duration_minutes")
        .in("id", planIds));
      planDurations = Object.fromEntries(
        (plans ?? []).map((p) => [p.id, p.visit_duration_minutes ?? 60])
      );
    }
    for (const [customerId2, planId] of Object.entries(planByCustomer)) {
      durationByCustomer[customerId2] = planDurations[planId] ?? 60;
    }
  }

  // Fetch all gardener assignments from junction table for these services
  const serviceIds = (data ?? []).map((s) => s.id);
  const gardenersByService: Record<string, string[]> = {};
  if (serviceIds.length > 0) {
    const { data: junctionAll } = await ctx.trackQuery(async () => supabase
      .from("service_visit_gardeners")
      .select("service_id, gardener_id")
      .in("service_id", serviceIds));
    for (const row of junctionAll ?? []) {
      if (!gardenersByService[row.service_id]) gardenersByService[row.service_id] = [];
      gardenersByService[row.service_id].push(row.gardener_id);
    }
  }

  const services = (data ?? []).map((s) => ({
    ...s,
    customer_name: customerNames[s.customer_id] ?? "Unknown",
    gardener_name: s.assigned_gardener_id
      ? gardenerNames[s.assigned_gardener_id] ?? "Unknown"
      : null,
    gardener_ids: gardenersByService[s.id] ?? (s.assigned_gardener_id ? [s.assigned_gardener_id] : []),
    visit_duration_minutes: durationByCustomer[s.customer_id] ?? 60,
  }));

  return NextResponse.json({ data: services });
});
