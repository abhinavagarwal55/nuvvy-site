import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  PLANT_INVOICE_TEMPLATE_KEY,
  PLANT_INVOICE_SERVICE_LINES_KEY,
  PLANT_INVOICE_FOOTER_NOTE_KEY,
  DEFAULT_PLANT_INVOICE_TEMPLATE,
  DEFAULT_PLANT_INVOICE_FOOTER_NOTE,
  parseServiceLines,
} from "@/lib/billing/plant-invoice-template";

const PutSchema = z.object({
  template: z.string().min(1).max(4000),
  service_lines: z.array(z.string().min(1).max(300)).max(20),
  footer_note: z.string().max(2000).optional(),
});

// GET /api/ops/system-config/plant-invoice-template — admin only
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_config")
    .select("key, value")
    .in("key", [
      PLANT_INVOICE_TEMPLATE_KEY,
      PLANT_INVOICE_SERVICE_LINES_KEY,
      PLANT_INVOICE_FOOTER_NOTE_KEY,
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));

  return NextResponse.json({
    data: {
      template: byKey[PLANT_INVOICE_TEMPLATE_KEY] ?? DEFAULT_PLANT_INVOICE_TEMPLATE,
      service_lines: parseServiceLines(byKey[PLANT_INVOICE_SERVICE_LINES_KEY]),
      footer_note:
        byKey[PLANT_INVOICE_FOOTER_NOTE_KEY] ?? DEFAULT_PLANT_INVOICE_FOOTER_NOTE,
    },
  });
}

// PUT /api/ops/system-config/plant-invoice-template — admin only
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const cleanedLines = parsed.data.service_lines
    .map((s) => s.trim())
    .filter(Boolean);

  const footerNote = (parsed.data.footer_note ?? DEFAULT_PLANT_INVOICE_FOOTER_NOTE).trim();

  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("system_config").upsert(
    [
      { key: PLANT_INVOICE_TEMPLATE_KEY, value: parsed.data.template, updated_at: now },
      {
        key: PLANT_INVOICE_SERVICE_LINES_KEY,
        value: JSON.stringify(cleanedLines),
        updated_at: now,
      },
      { key: PLANT_INVOICE_FOOTER_NOTE_KEY, value: footerNote, updated_at: now },
    ],
    { onConflict: "key" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_invoice_template.updated",
    targetTable: "system_config",
    targetId: PLANT_INVOICE_TEMPLATE_KEY,
    metadata: {
      template_length: parsed.data.template.length,
      service_line_count: cleanedLines.length,
      footer_note_length: footerNote.length,
    },
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { template: parsed.data.template, service_lines: cleanedLines, footer_note: footerNote },
  });
}
