import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { monthBounds } from "@/lib/billing/template";

const PutSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
    amount_inr: z.number().int().min(0).optional(),
    is_paid: z.boolean().optional(),
  })
  .refine((v) => v.amount_inr !== undefined || v.is_paid !== undefined, {
    message: "At least one of amount_inr, is_paid required",
  });

type MasterRow = {
  id: string;
  payee_profile_id: string | null;
  payee_name: string | null;
  category: string;
  monthly_amount_inr: number;
};

type ExpenseRow = {
  id: string;
  amount_inr: number;
  is_paid: boolean;
  status: "active" | "voided";
};

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// PUT /api/ops/payroll/month/[compensation_id] — admin only.
// Lazy-upsert the realized `expenses` row for (compensation_id, month), mirroring
// the Billing per-subscription PUT. First write realizes the row from the master.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ compensation_id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin"]);
  } catch (res) {
    return res as Response;
  }

  const parsed = PutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { month, amount_inr, is_paid } = parsed.data;

  let bounds: { start: string };
  try {
    bounds = monthBounds(month);
  } catch {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const { compensation_id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: masterRaw, error: masterErr } = await supabase
    .from("staff_compensation")
    .select("id, payee_profile_id, payee_name, category, monthly_amount_inr")
    .eq("id", compensation_id)
    .maybeSingle();
  if (masterErr)
    return NextResponse.json({ error: masterErr.message }, { status: 500 });
  if (!masterRaw)
    return NextResponse.json({ error: "Compensation not found" }, { status: 404 });
  const master = masterRaw as MasterRow;

  const defaultAmount = master.monthly_amount_inr;

  const { data: existing, error: existErr } = await supabase
    .from("expenses")
    .select("id, amount_inr, is_paid, status")
    .eq("compensation_id", compensation_id)
    .eq("expense_month", bounds.start)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existErr)
    return NextResponse.json({ error: existErr.message }, { status: 500 });

  const ip = ipFrom(request);
  const userAgent = request.headers.get("user-agent") || null;
  const nowIso = new Date().toISOString();
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> =
    [];
  let expenseId: string;
  let createdNew = false;

  if (!existing) {
    const insertAmount = amount_inr ?? defaultAmount;
    const paid = is_paid === true;
    const { data: created, error: insErr } = await supabase
      .from("expenses")
      .insert({
        category: master.category,
        expense_month: bounds.start,
        amount_inr: insertAmount,
        payee_profile_id: master.payee_profile_id,
        payee_name: master.payee_name,
        compensation_id,
        is_paid: paid,
        paid_at: paid ? nowIso : null,
        paid_by: paid ? auth.userId : null,
        submitted_by: auth.userId,
      })
      .select("id")
      .single();
    if (insErr || !created)
      return NextResponse.json(
        { error: insErr?.message ?? "Failed to realize payroll row" },
        { status: 500 }
      );
    expenseId = created.id;
    createdNew = true;
    auditEvents.push({
      action: "expense.created",
      metadata: { compensation_id, month, amount_inr: insertAmount },
    });
    if (amount_inr !== undefined && amount_inr !== defaultAmount) {
      auditEvents.push({
        action: "expense.amount_updated",
        metadata: { old: defaultAmount, new: amount_inr },
      });
    }
    if (paid) auditEvents.push({ action: "expense.marked_paid" });
  } else {
    const row = existing as ExpenseRow;
    expenseId = row.id;
    const updates: Record<string, unknown> = { updated_at: nowIso };

    if (amount_inr !== undefined && amount_inr !== row.amount_inr) {
      updates.amount_inr = amount_inr;
      auditEvents.push({
        action: "expense.amount_updated",
        metadata: { old: row.amount_inr, new: amount_inr },
      });
    }
    if (is_paid === true && !row.is_paid) {
      updates.is_paid = true;
      updates.paid_at = nowIso;
      updates.paid_by = auth.userId;
      auditEvents.push({ action: "expense.marked_paid" });
    } else if (is_paid === false && row.is_paid) {
      updates.is_paid = false;
      updates.paid_at = null;
      updates.paid_by = null;
      auditEvents.push({ action: "expense.unmarked_paid" });
    }

    if (Object.keys(updates).length > 1) {
      const { error: updErr } = await supabase
        .from("expenses")
        .update(updates)
        .eq("id", row.id);
      if (updErr)
        return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  for (const evt of auditEvents) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: evt.action,
      targetTable: "expenses",
      targetId: expenseId,
      metadata: evt.metadata,
      ip,
      userAgent,
    });
  }

  return NextResponse.json(
    { data: { expense_id: expenseId } },
    { status: createdNew ? 201 : 200 }
  );
}
