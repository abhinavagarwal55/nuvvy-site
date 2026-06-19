import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { currentMonthKey } from "@/lib/billing/template";
import { getMonthlyPayrollSummary } from "@/lib/payroll/monthly-summary";

// GET /api/ops/payroll?month=YYYY-MM — admin only.
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin"]);
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || currentMonthKey();

  try {
    const supabase = getSupabaseAdmin();
    const summary = await getMonthlyPayrollSummary(supabase, month);
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payroll";
    if (message.startsWith("Invalid month")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
