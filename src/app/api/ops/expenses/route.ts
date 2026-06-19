import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { currentMonthKey, monthBounds } from "@/lib/billing/template";
import { getMonthlyExpensesSummary } from "@/lib/expenses/monthly-summary";
import { OPERATIONAL_CATEGORIES } from "@/lib/expenses/categories";

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// GET /api/ops/expenses?month=YYYY-MM&include_voided=false — admin or horti.
// Operational categories only; payroll rows are never returned here.
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
  const includeVoided = searchParams.get("include_voided") === "true";

  try {
    const supabase = getSupabaseAdmin();
    const summary = await getMonthlyExpensesSummary(supabase, month, includeVoided);
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load expenses";
    if (message.startsWith("Invalid month")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PostSchema = z.object({
  category: z.enum(OPERATIONAL_CATEGORIES),
  expense_month: z.string().regex(/^\d{4}-\d{2}$/, "expense_month must be YYYY-MM"),
  amount_inr: z.number().int().min(1),
  description: z.string().max(280).optional(),
  payee_name: z.string().max(120).optional(),
  is_paid: z.boolean().optional(),
  receipt_path: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

// POST /api/ops/expenses — admin or horti. Create an operational expense.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const isPaid = body.is_paid === true;

  const { data: created, error } = await supabase
    .from("expenses")
    .insert({
      category: body.category,
      expense_month: bounds.start,
      amount_inr: body.amount_inr,
      description: body.description ?? null,
      payee_name: body.payee_name ?? null,
      is_paid: isPaid,
      paid_at: isPaid ? nowIso : null,
      paid_by: isPaid ? auth.userId : null,
      receipt_path: body.receipt_path ?? null,
      notes: body.notes ?? null,
      submitted_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create expense" },
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
    },
    ip,
    userAgent,
  });
  if (isPaid) {
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
