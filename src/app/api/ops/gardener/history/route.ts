import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/gardener/history — services for this gardener over the past 7 days
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (!auth.gardener_id) {
    return NextResponse.json({ error: "Gardener only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const weekAgo = new Date(today);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];

  // Find all services where this gardener is assigned (primary or secondary)
  const { data: junctionRows } = await supabase
    .from("service_visit_gardeners")
    .select("service_id")
    .eq("gardener_id", auth.gardener_id);
  const assignedServiceIds = (junctionRows ?? []).map((r) => r.service_id);

  const { data, error } = await supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, not_completed_reason"
    )
    .in("id", assignedServiceIds.length > 0 ? assignedServiceIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("scheduled_date", weekAgoStr)
    .lt("scheduled_date", todayStr)
    .order("scheduled_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer name + address
  const customerIds = [...new Set((data ?? []).map((s) => s.customer_id))];
  let customerInfo: Record<string, { name: string; address: string | null }> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, address")
      .in("id", customerIds);
    customerInfo = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, { name: c.name, address: c.address }])
    );
  }

  const result = (data ?? []).map((s) => ({
    ...s,
    customer_name: customerInfo[s.customer_id]?.name ?? "Unknown",
    customer_address: customerInfo[s.customer_id]?.address ?? null,
  }));

  return NextResponse.json({ data: result });
}
