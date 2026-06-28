import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const Schema = z.object({ can_access_billing: z.boolean() });

// PATCH /api/ops/people/[id]/billing-access — admin only.
// Grant/revoke scoped Billing access for a horticulturist. [id] is a profiles.id.
export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { can_access_billing } = parsed.data;

  const supabase = getSupabaseAdmin();

  // Target must exist and be a horticulturist — the flag is meaningless for
  // admins (always full) and gardeners/customers (never).
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, can_access_billing")
    .eq("id", id)
    .maybeSingle();
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  if (profile.role !== "horticulturist") {
    return NextResponse.json(
      { error: "Billing access can only be set for horticulturists" },
      { status: 409 }
    );
  }

  const oldValue = profile.can_access_billing === true;

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ can_access_billing })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "person.billing_access_changed",
    targetTable: "profiles",
    targetId: id,
    metadata: { old: oldValue, new: can_access_billing },
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ data: { id, can_access_billing } });
}
