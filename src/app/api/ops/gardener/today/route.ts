import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/gardener/today — all services for this gardener today
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

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

  const { data: services, error } = await supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, time_window_end, status, started_at, completed_at, is_one_off"
    )
    .eq("assigned_gardener_id", gardenerId)
    .eq("scheduled_date", today)
    .order("time_window_start", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer names
  const customerIds = [...new Set((services ?? []).map((s) => s.customer_id))];
  let customerNames: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    customerNames = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c.name])
    );
  }

  const result = (services ?? []).map((s) => ({
    ...s,
    customer_name: customerNames[s.customer_id] ?? "Unknown",
  }));

  return NextResponse.json({ data: result });
}
