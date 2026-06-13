import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  REMINDER_TEMPLATE_KEY,
  REMINDER_STANDARD_LINES_KEY,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_STANDARD_FOCUS_LINES,
} from "@/lib/reminders/template";

const PutSchema = z.object({
  template: z.string().min(1).max(4000),
  standard_lines: z.string().max(2000),
});

// GET /api/ops/system-config/reminder-template — admin or horticulturist
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
    .select("key, value")
    .in("key", [REMINDER_TEMPLATE_KEY, REMINDER_STANDARD_LINES_KEY]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return NextResponse.json({
    data: {
      template: byKey[REMINDER_TEMPLATE_KEY] ?? DEFAULT_REMINDER_TEMPLATE,
      standard_lines: byKey[REMINDER_STANDARD_LINES_KEY] ?? DEFAULT_STANDARD_FOCUS_LINES,
    },
  });
}

// PUT /api/ops/system-config/reminder-template — admin only
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

  const parsed = PutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from("system_config").upsert(
    [
      { key: REMINDER_TEMPLATE_KEY, value: parsed.data.template, updated_at: now },
      { key: REMINDER_STANDARD_LINES_KEY, value: parsed.data.standard_lines, updated_at: now },
    ],
    { onConflict: "key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "reminder_template.updated",
    targetTable: "system_config",
    targetId: REMINDER_TEMPLATE_KEY,
    metadata: { template_length: parsed.data.template.length },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: parsed.data });
}
