import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { reactivateLeadInputSchema } from "@/lib/schemas/lead.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/ops/leads/[id]/reactivate — closed → active
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
  // Body is optional; tolerate empty/no JSON.
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = reactivateLeadInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, state, phone")
    .eq("id", id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.state !== "closed") {
    return NextResponse.json(
      { error: `Cannot reactivate a lead that is ${lead.state}` },
      { status: 409 }
    );
  }

  // Guard the unique-active-phone invariant before flipping state.
  const { data: activeDup } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", lead.phone)
    .eq("state", "active")
    .maybeSingle();
  if (activeDup) {
    return NextResponse.json(
      { error: "An active lead already exists for this phone", existing_lead_id: activeDup.id },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const note = parsed.data.note?.trim();
  const update: Record<string, unknown> = {
    state: "active",
    closed_reason: null,
    closed_note: null,
    closed_at: null,
    last_touch_at: now,
  };

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.reactivate",
    targetTable: "leads",
    targetId: id,
    metadata: { from: "closed", to: "active", note: note || null },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
