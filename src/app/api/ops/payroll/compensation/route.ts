import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { monthBounds } from "@/lib/billing/template";
import { PAYROLL_CATEGORIES } from "@/lib/expenses/categories";

const PostSchema = z
  .object({
    payee_profile_id: z.string().uuid().optional(),
    payee_name: z.string().max(120).optional(),
    category: z.enum(PAYROLL_CATEGORIES),
    monthly_amount_inr: z.number().int().min(0),
    effective_from: z.string().regex(/^\d{4}-\d{2}$/, "effective_from must be YYYY-MM"),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (v) =>
      (!!v.payee_profile_id && !v.payee_name) ||
      (!v.payee_profile_id && !!v.payee_name),
    { message: "Provide exactly one of payee_profile_id or payee_name" }
  );

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// POST /api/ops/payroll/compensation — create a recurring comp master. Admin only.
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
    bounds = monthBounds(body.effective_from);
  } catch {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: created, error } = await supabase
    .from("staff_compensation")
    .insert({
      payee_profile_id: body.payee_profile_id ?? null,
      payee_name: body.payee_name ?? null,
      category: body.category,
      monthly_amount_inr: body.monthly_amount_inr,
      effective_from: bounds.start,
      notes: body.notes ?? null,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create compensation" },
      { status: 500 }
    );
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "compensation.created",
    targetTable: "staff_compensation",
    targetId: created.id,
    metadata: {
      category: body.category,
      monthly_amount_inr: body.monthly_amount_inr,
      payee: body.payee_profile_id ?? body.payee_name,
    },
    ip: ipFrom(request),
    userAgent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ data: { id: created.id } }, { status: 201 });
}
