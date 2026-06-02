import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { currentMonthKey } from "@/lib/billing/template";
import { getMonthlyBillingSummary } from "@/lib/billing/monthly-summary";

// GET /api/ops/billing/subscriptions?month=YYYY-MM
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || currentMonthKey();

  try {
    const supabase = getSupabaseAdmin();
    const summary = await getMonthlyBillingSummary(supabase, month);
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load billing";
    if (message.startsWith("Invalid month")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
