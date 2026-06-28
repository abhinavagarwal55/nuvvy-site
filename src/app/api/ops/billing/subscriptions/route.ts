import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireBillingAccess } from "@/lib/auth/ops-auth";
import { currentMonthKey } from "@/lib/billing/template";
import { getMonthlyBillingSummary } from "@/lib/billing/monthly-summary";

// GET /api/ops/billing/subscriptions?month=YYYY-MM
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireBillingAccess(request);
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || currentMonthKey();

  try {
    const supabase = getSupabaseAdmin();
    const summary = await getMonthlyBillingSummary(supabase, month);
    // Scoped users never see revenue aggregates — strip `totals`.
    if (auth.billingScope === "scoped") {
      const { totals: _omit, ...rest } = summary;
      void _omit;
      return NextResponse.json({ data: rest });
    }
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load billing";
    if (message.startsWith("Invalid month")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
