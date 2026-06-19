import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import {
  currentMonthKey,
  formatMonthLabel,
} from "@/lib/billing/template";
import { getMonthlyBillingSummary } from "@/lib/billing/monthly-summary";
import { getMonthlyPlantOrderInvoiceSummary } from "@/lib/billing/plant-order-invoice-summary";
import { getMonthlyExpensesSummary } from "@/lib/expenses/monthly-summary";
import { getMonthlyPayrollSummary } from "@/lib/payroll/monthly-summary";

// GET /api/ops/summary?month=YYYY-MM — admin only.
// Revenue (reuse care-plan + plant-order aggregations) vs Costs (expenses ledger,
// payroll recorded via the lazy §3.3 rule). Both accrual and cash (PRD §4.4 / D2).
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

    const [carePlans, plantOrders, expenses, payroll] = await Promise.all([
      getMonthlyBillingSummary(supabase, month),
      getMonthlyPlantOrderInvoiceSummary(supabase, month),
      getMonthlyExpensesSummary(supabase, month, false),
      getMonthlyPayrollSummary(supabase, month),
    ]);

    const revenue = {
      care_plans: {
        billed: carePlans.totals.billed,
        collected: carePlans.totals.paid,
      },
      plant_orders: {
        billed: plantOrders.totals.revenue,
        collected: plantOrders.totals.paid,
      },
      total: {
        billed: carePlans.totals.billed + plantOrders.totals.revenue,
        collected: carePlans.totals.paid + plantOrders.totals.paid,
      },
    };

    const costs = {
      inputs: expenses.totals.inputs,
      plant_procurement: expenses.totals.plant_procurement,
      salary: payroll.totals.salary,
      consultant: payroll.totals.consultant,
      overhead: payroll.totals.overhead,
      total: {
        recorded:
          expenses.totals.all.recorded + payroll.totals.all.recorded,
        paid: expenses.totals.all.paid + payroll.totals.all.paid,
      },
    };

    const profit = {
      accrual: revenue.total.billed - costs.total.recorded,
      cash: revenue.total.collected - costs.total.paid,
    };

    return NextResponse.json({
      data: {
        month,
        month_label: formatMonthLabel(month),
        revenue,
        costs,
        profit,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load summary";
    if (message.startsWith("Invalid month")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
