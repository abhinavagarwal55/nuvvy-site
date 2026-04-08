import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const DeactivateSchema = z.object({
  reason: z.string().min(1, "Deactivation reason is required"),
});

// POST /api/ops/customers/[id]/deactivate — admin only
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
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = DeactivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify customer exists and is ACTIVE
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (customer.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Cannot deactivate: customer status is ${customer.status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // 1. Deactivate customer
  const { error: custErr } = await supabase
    .from("customers")
    .update({
      status: "INACTIVE",
      deactivation_reason: parsed.data.reason,
      deactivated_at: now,
    })
    .eq("id", id);

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  // 2. Pause subscription
  await supabase
    .from("subscriptions")
    .update({ status: "paused" })
    .eq("customer_id", id)
    .eq("status", "active");

  // 3. Deactivate slots
  await supabase
    .from("service_slots")
    .update({ is_active: false, effective_until: now.split("T")[0] })
    .eq("customer_id", id)
    .eq("is_active", true);

  // 4. Cancel future scheduled services
  const today = now.split("T")[0];
  await supabase
    .from("service_visits")
    .update({ status: "cancelled", cancellation_reason: "Customer deactivated" })
    .eq("customer_id", id)
    .eq("status", "scheduled")
    .gte("scheduled_date", today);

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.deactivated",
    targetTable: "customers",
    targetId: id,
    metadata: { reason: parsed.data.reason },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { customer_id: id, status: "INACTIVE" } });
}
