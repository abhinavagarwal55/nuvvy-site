import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const Schema = z.object({
  status: z.enum(["active", "inactive"]),
});

// PUT /api/ops/people/[id]/status — admin only
export async function PUT(
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
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be 'active' or 'inactive'" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { status } = parsed.data;

  const updates: Record<string, unknown> = {
    status,
    inactive_since: status === "inactive" ? new Date().toISOString().split("T")[0] : null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror is_active on gardeners table if applicable
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();

  if (profile?.role === "gardener") {
    await supabase
      .from("gardeners")
      .update({ is_active: status === "active" })
      .eq("profile_id", id);
  } else if (profile?.role === "horticulturist") {
    await supabase
      .from("horticulturists")
      .update({ is_active: status === "active" })
      .eq("profile_id", id);
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId, actorRole: auth.role,
    action: status === "active" ? "person.reactivated" : "person.deactivated",
    targetTable: "profiles", targetId: id,
    metadata: { new_status: status },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { ok: true, status } });
}
