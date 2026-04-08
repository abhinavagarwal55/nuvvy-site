import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// POST /api/ops/customers/[id]/reactivate — admin only
// Sets status back to ACTIVE. Does NOT restore slot or generate services.
// HLD: "Always prompt to reconfigure — balcony conditions and gardener availability change."
// The admin must assign a new plan + slot via the onboarding flow or customer 360.
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
  const supabase = getSupabaseAdmin();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (customer.status !== "INACTIVE") {
    return NextResponse.json(
      { error: `Cannot reactivate: customer status is ${customer.status}` },
      { status: 400 }
    );
  }

  // Only set status back to ACTIVE — no slot/subscription restoration
  const { error: custErr } = await supabase
    .from("customers")
    .update({
      status: "ACTIVE",
      deactivation_reason: null,
      deactivated_at: null,
    })
    .eq("id", id);

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.reactivated",
    targetTable: "customers",
    targetId: id,
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: {
      customer_id: id,
      status: "ACTIVE",
      note: "Customer reactivated. Assign a plan and slot to resume services.",
    },
  });
}
