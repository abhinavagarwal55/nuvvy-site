import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getMonthlyPlantOrderInvoiceSummary } from "@/lib/billing/plant-order-invoice-summary";
import { currentMonthKey } from "@/lib/billing/template";

// ---------------------------------------------------------------------------
// GET /api/ops/billing/plant-orders?month=YYYY-MM — admin only
// Monthly Plant Orders billing summary (PRD §4 / §6.1).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  // Billing module is admin-only.
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "")
    ? (monthParam as string)
    : currentMonthKey();

  const supabase = getSupabaseAdmin();
  try {
    const summary = await getMonthlyPlantOrderInvoiceSummary(supabase, month);
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
