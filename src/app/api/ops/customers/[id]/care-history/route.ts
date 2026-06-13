import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

type CareHistoryRow = {
  id: string;
  // Internal action name (e.g. 'fertilizer', 'neem_oil'); UI maps to a label.
  action_name: string | null;
  // Calendar date (YYYY-MM-DD, IST) the input was applied: done_at's date,
  // falling back to the visit date. Null only if neither is known.
  applied_at: string | null;
  was_due: boolean;
  visit_id: string;
  visit_date: string | null;
};

// done_at is a timestamptz; the UI shows a date only and formatDate() expects a
// bare YYYY-MM-DD. Reduce the timestamp to its IST calendar date so it renders
// correctly regardless of server timezone (visit dates are already date-only).
function toIstDateOnly(ts: string | null): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  const ist = new Date(t + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// GET /api/ops/customers/[id]/care-history
// History of input applications (fertilizer, neem oil, etc.) that were actually
// performed for this customer. Source of truth is service_care_actions
// (marked_done = true), joined through service_visits + care_action_types.
// Admin + horticulturist only.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // !inner forces the service_visits join so we can filter care actions by
  // customer_id (which lives on the visit, not on service_care_actions).
  const { data, error } = await supabase
    .from("service_care_actions")
    .select(
      `
      id,
      marked_done,
      done_at,
      was_due,
      care_action_types ( name ),
      service_visits!inner ( id, scheduled_date, customer_id )
    `
    )
    .eq("service_visits.customer_id", id)
    .eq("marked_done", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: CareHistoryRow[] = (data ?? []).map((r) => {
    const type = Array.isArray(r.care_action_types) ? r.care_action_types[0] : r.care_action_types;
    const visit = Array.isArray(r.service_visits) ? r.service_visits[0] : r.service_visits;
    const visitDate = (visit as { scheduled_date?: string } | null)?.scheduled_date ?? null;
    return {
      id: r.id,
      action_name: (type as { name?: string } | null)?.name ?? null,
      applied_at: toIstDateOnly(r.done_at) ?? visitDate ?? null,
      was_due: r.was_due,
      visit_id: (visit as { id: string } | null)?.id ?? "",
      visit_date: visitDate,
    };
  });

  // Newest application first. done_at may be null on legacy rows, hence the JS sort.
  rows.sort(
    (a, b) =>
      new Date(b.applied_at ?? 0).getTime() - new Date(a.applied_at ?? 0).getTime()
  );

  return NextResponse.json({ data: rows });
}
