import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  BILLING_TEMPLATE_KEY,
  DEFAULT_BILLING_TEMPLATE,
} from "@/lib/billing/template";

const PutSchema = z.object({
  template: z.string().min(1).max(4000),
});

// GET /api/ops/system-config/billing-template — admin or horticulturist
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", BILLING_TEMPLATE_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: { template: data?.value ?? DEFAULT_BILLING_TEMPLATE },
  });
}

// PUT /api/ops/system-config/billing-template — admin only
export async function PUT(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("system_config")
    .upsert(
      {
        key: BILLING_TEMPLATE_KEY,
        value: parsed.data.template,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "billing_template.updated",
    targetTable: "system_config",
    targetId: BILLING_TEMPLATE_KEY,
    metadata: { length: parsed.data.template.length },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { template: parsed.data.template } });
}
