import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMonthLabel, monthBounds } from "@/lib/billing/template";
import { getSignedUrls } from "@/lib/supabase/storage";
import {
  OPERATIONAL_CATEGORIES,
  type OperationalCategory,
  type OperationalGroup,
  operationalGroup,
} from "@/lib/expenses/categories";

const OPS_BUCKET = "nuvvy-ops";

export type OperationalExpenseRow = {
  id: string;
  category: OperationalCategory;
  category_group: OperationalGroup;
  amount_inr: number;
  description: string | null;
  payee_name: string | null;
  is_paid: boolean;
  paid_at: string | null;
  receipt_url: string | null;
  submitted_by_name: string;
  submitted_by_id: string;
  status: "active" | "voided";
  created_at: string;
};

type GroupTotal = { recorded: number; paid: number };

export type OperationalExpensesSummary = {
  month: string;
  month_label: string;
  rows: OperationalExpenseRow[];
  totals: {
    inputs: GroupTotal;
    plant_procurement: GroupTotal;
    all: GroupTotal;
  };
};

type ExpenseDbRow = {
  id: string;
  category: string;
  amount_inr: number;
  description: string | null;
  payee_profile_id: string | null;
  payee_name: string | null;
  is_paid: boolean;
  paid_at: string | null;
  receipt_path: string | null;
  status: "active" | "voided";
  submitted_by: string;
  created_at: string;
};

export async function getMonthlyExpensesSummary(
  supabase: SupabaseClient,
  month: string,
  includeVoided = false
): Promise<OperationalExpensesSummary> {
  const bounds = monthBounds(month);

  let query = supabase
    .from("expenses")
    .select(
      "id, category, amount_inr, description, payee_profile_id, payee_name, is_paid, paid_at, receipt_path, status, submitted_by, created_at"
    )
    .eq("expense_month", bounds.start)
    .in("category", OPERATIONAL_CATEGORIES as unknown as string[]);

  if (!includeVoided) query = query.eq("status", "active");

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const dbRows = (data ?? []) as ExpenseDbRow[];

  // Resolve submitter names + profile-payee names in one profiles fetch.
  const profileIds = new Set<string>();
  for (const r of dbRows) {
    profileIds.add(r.submitted_by);
    if (r.payee_profile_id) profileIds.add(r.payee_profile_id);
  }
  let nameById: Record<string, string> = {};
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(profileIds));
    nameById = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "—"])
    );
  }

  // Batch-sign receipt URLs.
  const receiptPaths = dbRows
    .map((r) => r.receipt_path)
    .filter((p): p is string => !!p);
  const signed = await getSignedUrls(OPS_BUCKET, receiptPaths);

  const rows: OperationalExpenseRow[] = dbRows.map((r) => {
    const category = r.category as OperationalCategory;
    return {
      id: r.id,
      category,
      category_group: operationalGroup(category),
      amount_inr: r.amount_inr,
      description: r.description,
      payee_name: r.payee_profile_id
        ? nameById[r.payee_profile_id] ?? r.payee_name
        : r.payee_name,
      is_paid: r.is_paid,
      paid_at: r.paid_at,
      receipt_url: r.receipt_path ? signed[r.receipt_path] ?? null : null,
      submitted_by_name: nameById[r.submitted_by] ?? "—",
      submitted_by_id: r.submitted_by,
      status: r.status,
      created_at: r.created_at,
    };
  });

  // Totals exclude voided rows regardless of includeVoided.
  const totals = {
    inputs: { recorded: 0, paid: 0 },
    plant_procurement: { recorded: 0, paid: 0 },
    all: { recorded: 0, paid: 0 },
  };
  for (const r of rows) {
    if (r.status !== "active") continue;
    const g = totals[r.category_group];
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
