import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const ALLOWED_STATUS = new Set(["draft", "pending_payment", "paid"]);

// GET /api/ops/ondemand/bills?status=draft&limit=50 — list on-demand bills.
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("bills")
    .select(
      "id, service_visit_id, customer_id, amount_inr, hourly_rate, actual_hours_spent, status, generated_at, paid_at, notes, created_at"
    )
    .eq("bill_type", "ondemand")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && ALLOWED_STATUS.has(status)) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const customerIds = [...new Set(rows.map((b) => b.customer_id))];
  const visitIds = [...new Set(rows.map((b) => b.service_visit_id).filter(Boolean))] as string[];

  // Customers (name + phone + source + society + unit).
  const customerMap: Record<string, { id: string; name: string; phone_number: string | null; source: string | null; society: string | null; apartment_number: string | null }> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, phone_number, source, unit_number, societies(name)")
      .in("id", customerIds);
    for (const c of customers ?? []) {
      const society = c.societies as unknown as { name: string } | null;
      customerMap[c.id] = {
        id: c.id,
        name: c.name,
        phone_number: c.phone_number,
        source: c.source ?? null,
        society: society?.name ?? null,
        apartment_number: c.unit_number,
      };
    }
  }

  // Service dates.
  const serviceDateMap: Record<string, string> = {};
  if (visitIds.length > 0) {
    const { data: visits } = await supabase
      .from("service_visits")
      .select("id, scheduled_date")
      .in("id", visitIds);
    for (const v of visits ?? []) serviceDateMap[v.id] = v.scheduled_date;
  }

  const bills = rows.map((b) => ({
    id: b.id,
    service_visit_id: b.service_visit_id,
    customer: customerMap[b.customer_id] ?? { id: b.customer_id, name: "Unknown", phone_number: null, source: null, society: null, apartment_number: null },
    amount: b.amount_inr,
    hourly_rate: b.hourly_rate,
    actual_hours_spent: b.actual_hours_spent,
    status: b.status,
    generated_at: b.generated_at,
    paid_at: b.paid_at,
    notes: b.notes,
    service_date: b.service_visit_id ? serviceDateMap[b.service_visit_id] ?? null : null,
    created_at: b.created_at,
  }));

  return NextResponse.json({ data: bills });
}
