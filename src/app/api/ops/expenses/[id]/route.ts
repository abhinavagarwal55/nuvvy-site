import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  OPERATIONAL_CATEGORIES,
  PAYROLL_CATEGORIES,
  isPayrollCategory,
} from "@/lib/expenses/categories";

const ALL_CATEGORIES = [...OPERATIONAL_CATEGORIES, ...PAYROLL_CATEGORIES] as const;

const PutSchema = z
  .object({
    amount_inr: z.number().int().nonnegative().optional(),
    description: z.string().max(280).nullable().optional(),
    payee_name: z.string().max(120).nullable().optional(),
    category: z.enum(ALL_CATEGORIES).optional(),
    is_paid: z.boolean().optional(),
    receipt_path: z.string().max(500).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

type ExpenseRow = {
  id: string;
  category: string;
  amount_inr: number;
  is_paid: boolean;
  status: "active" | "voided";
  submitted_by: string;
  receipt_path: string | null;
};

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// PUT /api/ops/expenses/[id] — edit an expense (operational or one-off payroll).
// Permission keys off the TARGET row's category:
//   payroll category → admin only;  operational → submitter or admin.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from("expenses")
    .select("id, category, amount_inr, is_paid, status, submitted_by, receipt_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }
  const row = existing as ExpenseRow;
  if (row.status === "voided") {
    return NextResponse.json(
      { error: "Cannot edit a voided expense" },
      { status: 409 }
    );
  }

  // Permission: payroll rows are admin-only; operational rows allow the submitter.
  const isAdmin = auth.role === "admin";
  if (isPayrollCategory(row.category)) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
  } else if (!isAdmin && row.submitted_by !== auth.userId) {
    return NextResponse.json(
      { error: "Only the submitter or an admin can edit this expense" },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: nowIso };
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> =
    [];

  if (body.amount_inr !== undefined && body.amount_inr !== row.amount_inr) {
    updates.amount_inr = body.amount_inr;
    auditEvents.push({
      action: "expense.amount_updated",
      metadata: { old: row.amount_inr, new: body.amount_inr },
    });
  }

  const otherFields: string[] = [];
  if (body.description !== undefined) {
    updates.description = body.description;
    otherFields.push("description");
  }
  if (body.payee_name !== undefined) {
    updates.payee_name = body.payee_name;
    otherFields.push("payee_name");
  }
  if (body.category !== undefined && body.category !== row.category) {
    updates.category = body.category;
    otherFields.push("category");
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes;
    otherFields.push("notes");
  }

  if (body.receipt_path !== undefined && body.receipt_path !== row.receipt_path) {
    updates.receipt_path = body.receipt_path;
    if (body.receipt_path) {
      auditEvents.push({ action: "expense.receipt_attached" });
    } else {
      otherFields.push("receipt_path");
    }
  }

  if (body.is_paid === true && !row.is_paid) {
    updates.is_paid = true;
    updates.paid_at = nowIso;
    updates.paid_by = auth.userId;
    auditEvents.push({ action: "expense.marked_paid" });
  } else if (body.is_paid === false && row.is_paid) {
    updates.is_paid = false;
    updates.paid_at = null;
    updates.paid_by = null;
    auditEvents.push({ action: "expense.unmarked_paid" });
  }

  if (otherFields.length > 0) {
    auditEvents.push({
      action: "expense.updated",
      metadata: { fields: otherFields },
    });
  }

  const { error: updErr } = await supabase
    .from("expenses")
    .update(updates)
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const ip = ipFrom(request);
  const userAgent = request.headers.get("user-agent") || null;
  for (const evt of auditEvents) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: evt.action,
      targetTable: "expenses",
      targetId: id,
      metadata: evt.metadata,
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ data: { id } });
}
