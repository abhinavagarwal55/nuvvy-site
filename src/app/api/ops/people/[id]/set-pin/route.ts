import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { hashPin } from "@/lib/auth/pin";
import { logAuditEvent } from "@/lib/services/audit";

const Schema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

// POST /api/ops/people/[id]/set-pin — admin or horticulturist
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
  if (!["admin", "horticulturist"].includes(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify this profile is a gardener
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  if (!profile) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  if (profile.role !== "gardener") {
    return NextResponse.json({ error: "PIN is only applicable to gardeners" }, { status: 400 });
  }

  // Fetch current pin_version then increment
  const { data: gardener } = await supabase
    .from("gardeners")
    .select("pin_version")
    .eq("profile_id", id)
    .single();

  const pin_hash = await hashPin(parsed.data.pin);

  const { error } = await supabase
    .from("gardeners")
    .update({
      pin_hash,
      pin_version: (gardener?.pin_version ?? 0) + 1,
    })
    .eq("profile_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId, actorRole: auth.role, action: "gardener.pin_reset",
    targetTable: "gardeners", targetId: id,
    metadata: { new_pin_version: (gardener?.pin_version ?? 0) + 1 },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { ok: true } });
}
