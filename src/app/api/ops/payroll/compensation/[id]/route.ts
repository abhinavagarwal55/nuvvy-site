import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const PutSchema = z
  .object({
    monthly_amount_inr: z.number().int().min(0).optional(),
    notes: z.string().max(1000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// PUT /api/ops/payroll/compensation/[id] — admin only.
// Changing monthly_amount_inr changes FUTURE-month defaults only (months with a
// realized expenses row keep their stored amount). is_active=false deactivates.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  const body = parsed.data;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from("staff_compensation")
    .select("id, monthly_amount_inr, is_active")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing)
    return NextResponse.json({ error: "Compensation not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: nowIso };
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> =
    [];

  if (
    body.monthly_amount_inr !== undefined &&
    body.monthly_amount_inr !== existing.monthly_amount_inr
  ) {
    updates.monthly_amount_inr = body.monthly_amount_inr;
    auditEvents.push({
      action: "compensation.amount_updated",
      metadata: { old: existing.monthly_amount_inr, new: body.monthly_amount_inr },
    });
  }

  if (body.notes !== undefined) updates.notes = body.notes;

  if (body.is_active === false && existing.is_active) {
    updates.is_active = false;
    updates.deactivated_at = nowIso;
    updates.deactivated_by = auth.userId;
    auditEvents.push({ action: "compensation.deactivated" });
  } else if (body.is_active === true && !existing.is_active) {
    updates.is_active = true;
    updates.deactivated_at = null;
    updates.deactivated_by = null;
  }

  const { error: updErr } = await supabase
    .from("staff_compensation")
    .update(updates)
    .eq("id", id);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  const ip = ipFrom(request);
  const userAgent = request.headers.get("user-agent") || null;
  for (const evt of auditEvents) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: evt.action,
      targetTable: "staff_compensation",
      targetId: id,
      metadata: evt.metadata,
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ data: { id } });
}
