import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const ReassignSchema = z.object({
  gardener_id: z.string().uuid("gardener_id must be a valid UUID"),
});

// POST /api/ops/services/[id]/reassign — reassign gardener for a service
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

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ReassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify service exists and is in a reassignable state
  const { data: service, error: svcErr } = await supabase
    .from("service_visits")
    .select("id, status, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (svcErr || !service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (!["scheduled", "in_progress"].includes(service.status)) {
    return NextResponse.json(
      { error: `Cannot reassign: service status is '${service.status}'` },
      { status: 409 }
    );
  }

  // Verify the new gardener exists and get name from profiles
  const { data: gardenerRow, error: gErr } = await supabase
    .from("gardeners")
    .select("id, profile_id")
    .eq("id", parsed.data.gardener_id)
    .single();

  if (gErr || !gardenerRow) {
    return NextResponse.json({ error: "Gardener not found" }, { status: 404 });
  }

  let gardenerName = "Unknown";
  if (gardenerRow.profile_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", gardenerRow.profile_id)
      .single();
    gardenerName = profile?.full_name ?? "Unknown";
  }

  const oldGardenerId = service.assigned_gardener_id;

  const { data: updated, error: updateErr } = await supabase
    .from("service_visits")
    .update({ assigned_gardener_id: parsed.data.gardener_id })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "service.reassigned",
    targetTable: "service_visits",
    targetId: id,
    metadata: {
      old_gardener_id: oldGardenerId,
      new_gardener_id: parsed.data.gardener_id,
      new_gardener_name: gardenerName,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
