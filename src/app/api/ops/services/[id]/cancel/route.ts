import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const CancelSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

// POST /api/ops/services/[id]/cancel — cancel a scheduled service
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

  // Only admin/horticulturist can cancel
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (!["scheduled", "in_progress"].includes(service.status)) {
    return NextResponse.json(
      { error: `Cannot cancel: status is ${service.status}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("service_visits")
    .update({
      status: "cancelled",
      not_completed_reason: parsed.data.reason,
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
    action: "service.cancelled",
    targetTable: "service_visits",
    targetId: id,
    metadata: { reason: parsed.data.reason },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
