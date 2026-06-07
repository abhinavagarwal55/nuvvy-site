import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { customerTypeSchema } from "@/lib/schemas/customer-type";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ChangeTypeSchema = z.object({
  customer_type: customerTypeSchema,
  note: z.string().optional(),
});

// POST /api/ops/customers/[id]/change-type — the ONLY way customer_type changes
// after create. Audited label flip. Does NOT create/destroy subscriptions,
// slots, visits, or care schedules — provisioning/teardown is handled separately
// via existing Customer-360 tools (PRD §6.4, §8.3). admin + horticulturist only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = ChangeTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { customer_type, note } = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, customer_type")
    .eq("id", id)
    .maybeSingle();

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const from = customer.customer_type as string;

  // Idempotent no-op — already this type. No update, no audit row.
  if (from === customer_type) {
    return NextResponse.json({
      data: { customer_id: id, customer_type, changed: false },
    });
  }

  const { error: updateErr } = await supabase
    .from("customers")
    .update({ customer_type })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.type_changed",
    targetTable: "customers",
    targetId: id,
    metadata: { from, to: customer_type, note: note ?? null },
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: { customer_id: id, customer_type, changed: true },
  });
}
