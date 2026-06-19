import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMonthLabel, monthBounds } from "@/lib/billing/template";
import {
  PAYROLL_CATEGORIES,
  type PayrollCategory,
} from "@/lib/expenses/categories";

export type PayrollRow = {
  compensation_id: string | null; // null for one-offs
  expense_id: string | null; // realized row id; null until first write (recurring)
  category: PayrollCategory;
  payee_name: string;
  payee_profile_id: string | null;
  is_people_member: boolean;
  person_status: "active" | "inactive" | null;
  default_amount_inr: number;
  amount_inr: number;
  is_paid: boolean;
  paid_at: string | null;
  notes: string | null;
};

type CatTotal = { recorded: number; paid: number };

export type PayrollSummary = {
  month: string;
  month_label: string;
  rows: PayrollRow[];
  totals: {
    salary: CatTotal;
    consultant: CatTotal;
    overhead: CatTotal;
    all: CatTotal;
  };
};

type MasterRow = {
  id: string;
  payee_profile_id: string | null;
  payee_name: string | null;
  category: string;
  monthly_amount_inr: number;
  notes: string | null;
};

type RealizedRow = {
  id: string;
  compensation_id: string | null;
  category: string;
  amount_inr: number;
  is_paid: boolean;
  paid_at: string | null;
  payee_profile_id: string | null;
  payee_name: string | null;
  description: string | null;
  notes: string | null;
};

/**
 * Lazy payroll month merge (PRD §3.3): active comp masters seed each month's
 * default, realized `expenses` rows override per-month, plus one-off payroll rows.
 * Costs aggregation for the Summary reuses this so untouched masters still count.
 */
export async function getMonthlyPayrollSummary(
  supabase: SupabaseClient,
  month: string
): Promise<PayrollSummary> {
  const bounds = monthBounds(month);

  // 1. Active masters effective on/before this month.
  const { data: masterData, error: masterErr } = await supabase
    .from("staff_compensation")
    .select(
      "id, payee_profile_id, payee_name, category, monthly_amount_inr, notes"
    )
    .eq("is_active", true)
    .lte("effective_from", bounds.end);
  if (masterErr) throw new Error(masterErr.message);
  const masters = (masterData ?? []) as MasterRow[];

  // 2. Realized rows for these masters this month.
  const masterIds = masters.map((m) => m.id);
  let realizedByComp: Record<string, RealizedRow> = {};
  if (masterIds.length > 0) {
    const { data: realized, error: realErr } = await supabase
      .from("expenses")
      .select(
        "id, compensation_id, category, amount_inr, is_paid, paid_at, payee_profile_id, payee_name, description, notes"
      )
      .eq("expense_month", bounds.start)
      .eq("status", "active")
      .in("compensation_id", masterIds);
    if (realErr) throw new Error(realErr.message);
    realizedByComp = Object.fromEntries(
      (realized ?? [])
        .filter((r) => r.compensation_id)
        .map((r) => [r.compensation_id as string, r as RealizedRow])
    );
  }

  // 3. One-off payroll rows this month (compensation_id IS NULL).
  const { data: oneOffData, error: oneOffErr } = await supabase
    .from("expenses")
    .select(
      "id, compensation_id, category, amount_inr, is_paid, paid_at, payee_profile_id, payee_name, description, notes"
    )
    .eq("expense_month", bounds.start)
    .eq("status", "active")
    .is("compensation_id", null)
    .in("category", PAYROLL_CATEGORIES as unknown as string[]);
  if (oneOffErr) throw new Error(oneOffErr.message);
  const oneOffs = (oneOffData ?? []) as RealizedRow[];

  // 4. Resolve People names + status.
  const profileIds = new Set<string>();
  for (const m of masters) if (m.payee_profile_id) profileIds.add(m.payee_profile_id);
  for (const o of oneOffs) if (o.payee_profile_id) profileIds.add(o.payee_profile_id);
  let profileById: Record<string, { full_name: string; status: string }> = {};
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, status")
      .in("id", Array.from(profileIds));
    profileById = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.id as string,
        { full_name: (p.full_name as string) ?? "—", status: (p.status as string) ?? "active" },
      ])
    );
  }

  const rows: PayrollRow[] = [];

  for (const m of masters) {
    const realized = realizedByComp[m.id] ?? null;
    const profile = m.payee_profile_id ? profileById[m.payee_profile_id] : null;
    const personStatus =
      profile?.status === "inactive" ? "inactive" : profile ? "active" : null;
    rows.push({
      compensation_id: m.id,
      expense_id: realized?.id ?? null,
      category: m.category as PayrollCategory,
      payee_name: profile?.full_name ?? m.payee_name ?? "—",
      payee_profile_id: m.payee_profile_id,
      is_people_member: !!m.payee_profile_id,
      person_status: personStatus,
      default_amount_inr: m.monthly_amount_inr,
      amount_inr: realized?.amount_inr ?? m.monthly_amount_inr,
      is_paid: realized?.is_paid ?? false,
      paid_at: realized?.paid_at ?? null,
      notes: realized?.notes ?? m.notes,
    });
  }

  for (const o of oneOffs) {
    const profile = o.payee_profile_id ? profileById[o.payee_profile_id] : null;
    const personStatus =
      profile?.status === "inactive" ? "inactive" : profile ? "active" : null;
    rows.push({
      compensation_id: null,
      expense_id: o.id,
      category: o.category as PayrollCategory,
      payee_name: profile?.full_name ?? o.payee_name ?? o.description ?? "—",
      payee_profile_id: o.payee_profile_id,
      is_people_member: !!o.payee_profile_id,
      person_status: personStatus,
      default_amount_inr: o.amount_inr,
      amount_inr: o.amount_inr,
      is_paid: o.is_paid,
      paid_at: o.paid_at,
      notes: o.notes ?? o.description,
    });
  }

  rows.sort((a, b) => a.payee_name.localeCompare(b.payee_name));

  const totals = {
    salary: { recorded: 0, paid: 0 },
    consultant: { recorded: 0, paid: 0 },
    overhead: { recorded: 0, paid: 0 },
    all: { recorded: 0, paid: 0 },
  };
  for (const r of rows) {
    const g = totals[r.category];
    g.recorded += r.amount_inr;
    totals.all.recorded += r.amount_inr;
    if (r.is_paid) {
      g.paid += r.amount_inr;
      totals.all.paid += r.amount_inr;
    }
  }

  return {
    month,
    month_label: formatMonthLabel(month),
    rows,
    totals,
  };
}
