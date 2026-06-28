import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireBillingAccess } from "@/lib/auth/ops-auth";
import { getMonthlyPlantOrderInvoiceSummary } from "@/lib/billing/plant-order-invoice-summary";
import { currentMonthKey } from "@/lib/billing/template";

// ---------------------------------------------------------------------------
// GET /api/ops/billing/plant-orders?month=YYYY-MM
// Monthly Plant Orders billing summary (PRD §4 / §6.1). Admin (full) or a
// billing-scoped horticulturist (rows only, no revenue totals).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireBillingAccess(request);
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "")
    ? (monthParam as string)
    : currentMonthKey();

  const supabase = getSupabaseAdmin();
  try {
    const summary = await getMonthlyPlantOrderInvoiceSummary(supabase, month);
    // Scoped users never see revenue aggregates — strip `totals`.
    if (auth.billingScope === "scoped") {
      const { totals: _omit, ...rest } = summary;
      void _omit;
      return NextResponse.json({ data: rest });
    }
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
