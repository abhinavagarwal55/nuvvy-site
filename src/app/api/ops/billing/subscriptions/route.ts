import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import {
  currentMonthKey,
  formatMonthLabel,
  monthBounds,
} from "@/lib/billing/template";

type SubscriptionJoin = {
  id: string;
  customer_id: string;
  override_price: number | null;
  start_date: string;
  end_date: string | null;
  customers: {
    id: string;
    name: string;
    phone_number: string | null;
  } | null;
  service_plans: {
    id: string;
    name: string;
    price: number;
    visit_frequency: "weekly" | "fortnightly" | "monthly";
  } | null;
};

type BillRow = {
  id: string;
  customer_id: string;
  amount_inr: number;
  status: "pending" | "paid";
  paid_at: string | null;
  last_reminder_sent_at: string | null;
};

// GET /api/ops/billing/subscriptions?month=YYYY-MM
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
  const month = searchParams.get("month") || currentMonthKey();

  let bounds: { start: string; end: string };
  try {
    bounds = monthBounds(month);
  } catch {
    return NextResponse.json(
      { error: "Invalid month — expected YYYY-MM" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select(
      `
        id,
        customer_id,
        override_price,
        start_date,
        end_date,
        customers!inner ( id, name, phone_number ),
        service_plans!inner ( id, name, price, visit_frequency )
      `
    )
    .eq("status", "active")
    .lte("start_date", bounds.end)
    .or(`end_date.is.null,end_date.gte.${bounds.start}`);

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }

  const subscriptions = (subs ?? []) as unknown as SubscriptionJoin[];

  const customerIds = subscriptions
    .map((s) => s.customer_id)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);

  let billsByCustomer: Record<string, BillRow> = {};
  if (customerIds.length > 0) {
    const { data: bills, error: billsErr } = await supabase
      .from("bills")
      .select("id, customer_id, amount_inr, status, paid_at, last_reminder_sent_at")
      .eq("billing_period_start", bounds.start)
      .eq("billing_period_end", bounds.end)
      .in("customer_id", customerIds);

    if (billsErr) {
      return NextResponse.json({ error: billsErr.message }, { status: 500 });
    }
    billsByCustomer = Object.fromEntries(
      (bills ?? []).map((b) => [b.customer_id, b as BillRow])
    );
  }

  const rows = subscriptions
    .filter((s) => s.customers && s.service_plans)
    .map((s) => {
      const customer = s.customers!;
      const plan = s.service_plans!;
      const defaultAmount = Math.round(
        Number(s.override_price ?? plan.price)
      );
      const bill = billsByCustomer[s.customer_id] ?? null;
      const amount = bill?.amount_inr ?? defaultAmount;
      const isPaid = bill?.status === "paid";
      return {
        subscription_id: s.id,
        customer_id: s.customer_id,
        customer_name: customer.name,
        phone_number: customer.phone_number,
        plan_name: plan.name,
        plan_price: Math.round(Number(plan.price)),
        visit_frequency: plan.visit_frequency,
        default_amount_inr: defaultAmount,
        bill_id: bill?.id ?? null,
        amount_inr: amount,
        is_paid: isPaid,
        paid_at: bill?.paid_at ?? null,
        last_reminder_sent_at: bill?.last_reminder_sent_at ?? null,
      };
    })
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

  const billed = rows.reduce((sum, r) => sum + r.amount_inr, 0);
  const paid = rows.reduce((sum, r) => sum + (r.is_paid ? r.amount_inr : 0), 0);

  return NextResponse.json({
    data: {
      month,
      month_label: formatMonthLabel(month),
      rows,
      totals: {
        billed,
        paid,
        due: billed - paid,
      },
    },
  });
}
