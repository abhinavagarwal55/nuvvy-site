import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { convertLeadInputSchema } from "@/lib/schemas/lead.schema";
import { createDraftCustomer } from "@/lib/services/customers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/ops/leads/[id]/convert — active → converted, atomic with customer create.
//
// Supabase-js has no multi-statement transaction primitive, so atomicity is
// achieved with a compensating delete: the customer is created first, then the
// lead is stamped with a state-guarded update. If the stamp fails (error or a
// concurrent convert already won), the just-created customer is deleted so no
// orphan customer is ever left behind and the lead stays in its prior state.
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
  const parsed = convertLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    // Invalid payload → lead untouched, no customer created.
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, state, converted_customer_id")
    .eq("id", id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Idempotent: already converted → return the existing customer.
  if (lead.state === "converted") {
    return NextResponse.json(
      { data: { customer_id: lead.converted_customer_id }, already_converted: true },
      { status: 200 }
    );
  }

  if (lead.state !== "active") {
    return NextResponse.json(
      { error: `Cannot convert a lead that is ${lead.state}` },
      { status: 409 }
    );
  }

  // 1. Create the customer.
  const created = await createDraftCustomer(supabase, parsed.data, auth.userId);
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }
  const customerId = created.customer.id;

  // 2. Stamp the lead — state-guarded so a concurrent convert can't double-stamp.
  const now = new Date().toISOString();
  const { data: stamped, error: stampErr } = await supabase
    .from("leads")
    .update({
      state: "converted",
      converted_customer_id: customerId,
      converted_at: now,
      last_touch_at: now,
    })
    .eq("id", id)
    .eq("state", "active")
    .select("id")
    .maybeSingle();

  if (stampErr || !stamped) {
    // Roll back the customer we just created — keeps convert atomic.
    await supabase.from("customers").delete().eq("id", customerId);

    if (!stampErr) {
      // A concurrent convert won the race — return whichever customer it set.
      const { data: fresh } = await supabase
        .from("leads")
        .select("converted_customer_id, state")
        .eq("id", id)
        .maybeSingle();
      if (fresh?.state === "converted") {
        return NextResponse.json(
          { data: { customer_id: fresh.converted_customer_id }, already_converted: true },
          { status: 200 }
        );
      }
    }
    return NextResponse.json(
      { error: stampErr?.message ?? "Failed to convert lead" },
      { status: 500 }
    );
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.convert",
    targetTable: "leads",
    targetId: id,
    metadata: { from: "active", to: "converted", converted_customer_id: customerId },
    ip,
    userAgent,
  });

  return NextResponse.json(
    { data: { customer_id: customerId, customer: created.customer } },
    { status: 201 }
  );
}
