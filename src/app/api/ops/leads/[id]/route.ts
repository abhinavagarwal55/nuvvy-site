import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { patchLeadInputSchema } from "@/lib/schemas/lead.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAD_SELECT =
  "id, phone, name, state, source, society_id, area, qualifiers, notes, next_action, next_action_at, intended_customer_type, closed_reason, closed_note, closed_at, converted_customer_id, converted_at, first_seen_at, last_touch_at, created_at, updated_at, societies(name)";

function shapeLead(l: Record<string, unknown>) {
  const societyObj = l.societies as unknown as { name: string } | null;
  return { ...l, societies: undefined, society_name: societyObj?.name ?? null };
}

// GET /api/ops/leads/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: shapeLead(data) });
}

// PATCH /api/ops/leads/[id] — edit fields (never state). Works on active AND closed.
export async function PATCH(
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
  const parsed = patchLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Touch last_touch_at when the follow-up changed.
  if ("next_action" in updates || "next_action_at" in updates) {
    updates.last_touch_at = new Date().toISOString();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select(LEAD_SELECT)
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  const changedKeys = Object.keys(updates).filter((k) => k !== "last_touch_at");
  const followUpChanged = changedKeys.includes("next_action") || changedKeys.includes("next_action_at");
  const otherChanged = changedKeys.some((k) => k !== "next_action" && k !== "next_action_at");

  // A follow-up change is a meaningful, user-visible history event.
  if (followUpChanged) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "lead.follow_up_set",
      targetTable: "leads",
      targetId: id,
      metadata: {
        next_action: "next_action" in updates ? updates.next_action : data.next_action,
        next_action_at: "next_action_at" in updates ? updates.next_action_at : data.next_action_at,
      },
      ip,
      userAgent,
    });
  }
  // Detail edits are audit-only (not surfaced in the history timeline).
  if (otherChanged) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "lead.update",
      targetTable: "leads",
      targetId: id,
      metadata: { fields_changed: changedKeys.filter((k) => k !== "next_action" && k !== "next_action_at") },
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ data: shapeLead(data) });
}

// DELETE /api/ops/leads/[id] — hard delete (cascades lead_notes). Converted
// leads are protected: they're a customer's audit backref.
export async function DELETE(
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
  const supabase = getSupabaseAdmin();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, state, phone")
    .eq("id", id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.state === "converted") {
    return NextResponse.json(
      { error: "Converted leads cannot be deleted — they link to a customer." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.delete",
    targetTable: "leads",
    targetId: id,
    metadata: { state: lead.state, phone: lead.phone },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
