import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { closeLeadInputSchema } from "@/lib/schemas/lead.schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/ops/leads/[id]/close — active → closed
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
  const parsed = closeLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, state")
    .eq("id", id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.state !== "active") {
    return NextResponse.json(
      { error: `Cannot close a lead that is ${lead.state}` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .update({
      state: "closed",
      closed_reason: parsed.data.closed_reason,
      closed_note: parsed.data.closed_note ?? null,
      closed_at: now,
      last_touch_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "lead.close",
    targetTable: "leads",
    targetId: id,
    metadata: {
      from: "active",
      to: "closed",
      closed_reason: parsed.data.closed_reason,
      closed_note: parsed.data.closed_note ?? null,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
