import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMonthLabel, monthBounds } from "@/lib/billing/template";

export type BillingRow = {
  subscription_id: string;
  customer_id: string;
  customer_name: string;
  phone_number: string | null;
  plan_name: string;
  plan_price: number;
  visit_frequency: "weekly" | "fortnightly" | "monthly";
  default_amount_inr: number;
  bill_id: string | null;
  amount_inr: number;
  is_paid: boolean;
  paid_at: string | null;
  last_reminder_sent_at: string | null;
};

export type BillingSummary = {
  month: string;
  month_label: string;
  rows: BillingRow[];
  totals: { billed: number; paid: number; due: number };
};

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

export async function getMonthlyBillingSummary(
  supabase: SupabaseClient,
  month: string
): Promise<BillingSummary> {
  const bounds = monthBounds(month);

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

  if (subsErr) throw new Error(subsErr.message);

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

    if (billsErr) throw new Error(billsErr.message);
    billsByCustomer = Object.fromEntries(
      (bills ?? []).map((b) => [b.customer_id, b as BillRow])
    );
  }

  const rows: BillingRow[] = subscriptions
    .filter((s) => s.customers && s.service_plans)
    .map((s) => {
      const customer = s.customers!;
      const plan = s.service_plans!;
      const defaultAmount = Math.round(Number(s.override_price ?? plan.price));
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

  const billed = rows.reduce((s, r) => s + r.amount_inr, 0);
  const paid = rows.reduce((s, r) => s + (r.is_paid ? r.amount_inr : 0), 0);

  return {
    month,
    month_label: formatMonthLabel(month),
    rows,
    totals: { billed, paid, due: billed - paid },
  };
}
