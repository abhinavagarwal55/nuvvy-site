import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const RescheduleSchema = z.object({
  new_date: z.string(), // YYYY-MM-DD
  new_time_start: z.string().optional(), // HH:MM
  new_time_end: z.string().optional(),
});

// POST /api/ops/schedule/services/[id]/reschedule — "this visit only"
// For "all future", use PUT /api/ops/schedule/slots instead
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
  const body = await request.json();
  const parsed = RescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify service exists and is in a reschedulable state
  const { data: service, error: svcErr } = await supabase
    .from("service_visits")
    .select("id, status, scheduled_date")
    .eq("id", id)
    .single();

  if (svcErr || !service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot reschedule: service status is ${service.status}` },
      { status: 400 }
    );
  }

  // Update just this service — slot is unchanged
  const updates: Record<string, string> = {
    scheduled_date: parsed.data.new_date,
  };
  if (parsed.data.new_time_start) {
    updates.time_window_start = parsed.data.new_time_start;
  }
  if (parsed.data.new_time_end) {
    updates.time_window_end = parsed.data.new_time_end;
  }

  const { data, error } = await supabase
    .from("service_visits")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.rescheduled",
    targetTable: "service_visits",
    targetId: id,
    metadata: { new_date: parsed.data.new_date },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
