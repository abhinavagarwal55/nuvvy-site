import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/gardener/history — past services for this gardener
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
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, not_completed_reason"
    )
    .eq("assigned_gardener_id", auth.gardener_id)
    .in("status", ["completed", "not_completed"])
    .lt("scheduled_date", today)
    .order("scheduled_date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer names
  const customerIds = [...new Set((data ?? []).map((s) => s.customer_id))];
  let nameMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    nameMap = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c.name])
    );
  }

  const result = (data ?? []).map((s) => ({
    ...s,
    customer_name: nameMap[s.customer_id] ?? "Unknown",
  }));

  return NextResponse.json({ data: result });
}
