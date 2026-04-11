import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";

// GET /api/ops/dashboard/admin
export const GET = withPerfLog('/api/ops/dashboard/admin', async (request: NextRequest, ctx: PerfContext) => {
  let auth;
  try {
    auth = await ctx.trackAuth(() => requireOpsAuth(request));
  } catch (res) {
    return res as Response;
  }
  ctx.setUser(auth.userId, auth.role);
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  const [
    { count: activeCustomers },
    { data: todayServices },
    { data: pendingBills },
    { count: openRequests },
  ] = await ctx.trackQuery(async () => Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("service_visits")
      .select("status")
      .eq("scheduled_date", today),
    supabase
      .from("bills")
      .select("id, customer_id, amount_inr, due_date")
      .eq("status", "pending"),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]));

  // Compute service counts
  const svcByStatus: Record<string, number> = {};
  for (const s of todayServices ?? []) {
    svcByStatus[s.status] = (svcByStatus[s.status] ?? 0) + 1;
  }

  // Compute billing
  const overdueBills = (pendingBills ?? []).filter((b) => b.due_date < today);
  const totalPending = (pendingBills ?? []).reduce(
    (sum, b) => sum + b.amount_inr,
    0
  );
  const totalOverdue = overdueBills.reduce((sum, b) => sum + b.amount_inr, 0);

  // Join customer names for follow-up list
  const followUpBills = [...overdueBills, ...(pendingBills ?? []).filter((b) => b.due_date >= today)].slice(0, 10);
  const customerIds = [...new Set(followUpBills.map((b) => b.customer_id))];
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

  return NextResponse.json({
    data: {
      active_customers: activeCustomers ?? 0,
      services_today: svcByStatus,
      services_today_total: (todayServices ?? []).length,
      billing: {
        pending_count: (pendingBills ?? []).length,
        pending_total: totalPending,
        overdue_count: overdueBills.length,
        overdue_total: totalOverdue,
        follow_up: followUpBills.map((b) => ({
          id: b.id,
          customer_name: customerNames[b.customer_id] ?? "Unknown",
          amount_inr: b.amount_inr,
          due_date: b.due_date,
          is_overdue: b.due_date < today,
        })),
      },
      open_requests: openRequests ?? 0,
    },
  });
});
