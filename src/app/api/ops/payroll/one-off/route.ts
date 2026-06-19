import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { monthBounds } from "@/lib/billing/template";
import { PAYROLL_CATEGORIES } from "@/lib/expenses/categories";

const PostSchema = z.object({
  category: z.enum(PAYROLL_CATEGORIES),
  expense_month: z.string().regex(/^\d{4}-\d{2}$/, "expense_month must be YYYY-MM"),
  amount_inr: z.number().int().min(1),
  payee_name: z.string().max(120).optional(),
  description: z.string().max(280).optional(),
  is_paid: z.boolean().optional(),
});

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// POST /api/ops/payroll/one-off — admin only.
// Free-form, non-recurring payroll/overhead line (compensation_id = NULL).
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin"]);
  } catch (res) {
    return res as Response;
  }

  const parsed = PostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  let bounds: { start: string };
  try {
    bounds = monthBounds(body.expense_month);
  } catch {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const paid = body.is_paid === true;

  const { data: created, error } = await supabase
    .from("expenses")
    .insert({
      category: body.category,
      expense_month: bounds.start,
      amount_inr: body.amount_inr,
      payee_name: body.payee_name ?? null,
      description: body.description ?? null,
      compensation_id: null,
      is_paid: paid,
      paid_at: paid ? nowIso : null,
      paid_by: paid ? auth.userId : null,
      submitted_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create payroll line" },
      { status: 500 }
    );
  }

  const ip = ipFrom(request);
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "expense.created",
    targetTable: "expenses",
    targetId: created.id,
    metadata: {
      category: body.category,
      amount_inr: body.amount_inr,
      expense_month: body.expense_month,
      one_off: true,
    },
    ip,
    userAgent,
  });
  if (paid) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "expense.marked_paid",
      targetTable: "expenses",
      targetId: created.id,
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ data: { id: created.id } }, { status: 201 });
}
