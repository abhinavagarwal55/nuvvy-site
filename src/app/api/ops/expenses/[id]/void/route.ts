import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { isPayrollCategory } from "@/lib/expenses/categories";

const VoidSchema = z.object({ reason: z.string().max(500).optional() });

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// POST /api/ops/expenses/[id]/void — soft-delete an expense.
// Permission keys off the target row's category (payroll → admin only).
export async function POST(
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

  let reason: string | undefined;
  try {
    const raw = await request.json();
    const parsed = VoidSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    reason = parsed.data.reason;
  } catch {
    // Empty body is fine — reason is optional.
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from("expenses")
    .select("id, category, status, submitted_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }
  if (existing.status === "voided") {
    return NextResponse.json({ data: { id } }); // idempotent
  }

  const isAdmin = auth.role === "admin";
  if (isPayrollCategory(existing.category as string)) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
  } else if (!isAdmin && existing.submitted_by !== auth.userId) {
    return NextResponse.json(
      { error: "Only the submitter or an admin can void this expense" },
      { status: 403 }
    );
  }

  const { error: updErr } = await supabase
    .from("expenses")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "expense.voided",
    targetTable: "expenses",
    targetId: id,
    metadata: { reason: reason ?? null },
    ip: ipFrom(request),
    userAgent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ data: { id } });
}
