import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// Admin/horticulturist CMS for the fixed service checklist template (D1/D4/D6).
// Permission split:
//   admin           — add / soft-delete / reorder / edit English + translations
//   horticulturist  — edit hi/kn translations ONLY (structural writes → 403)
// English is canonical and never nulled. Soft-delete only (is_active=false).

function auditMeta(request: NextRequest) {
  return {
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  };
}

// GET — list template items (active + inactive) for the editor. Admin + horti.
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin" && auth.role !== "horticulturist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .select("id, label, label_hi, label_kn, is_required, is_active, order_index, needs_translation_review")
    .order("is_active", { ascending: false })
    .order("order_index");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const CreateSchema = z.object({
  label: z.string().min(1, "Label is required").max(300),
  is_required: z.boolean().optional(),
});

// POST — create a new checklist item (admin only). Appends at the end.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: last } = await supabase
    .from("checklist_template_items")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.order_index ?? 0) + 1;

  const { data, error } = await supabase
    .from("checklist_template_items")
    .insert({
      label: parsed.data.label,
      is_required: parsed.data.is_required ?? true,
      is_active: true,
      order_index: nextOrder,
      // needs_translation_review defaults true — new row needs hi/kn.
    })
    .select("id, label, label_hi, label_kn, is_required, is_active, order_index, needs_translation_review")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "checklist_item.created",
    targetTable: "checklist_template_items",
    targetId: data.id,
    metadata: { label: data.label },
    ...auditMeta(request),
  });
  return NextResponse.json({ data }, { status: 201 });
}

const PatchSchema = z
  .object({
    id: z.string().uuid(),
    // Structural / English (admin only)
    label: z.string().min(1).max(300).optional(),
    is_required: z.boolean().optional(),
    direction: z.enum(["up", "down"]).optional(),
    // Translations (admin + horti)
    label_hi: z.string().max(300).nullable().optional(),
    label_kn: z.string().max(300).nullable().optional(),
  })
  .strict();

// PATCH — edit English (admin), reorder (admin), or edit hi/kn (admin + horti).
export async function PATCH(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin" && auth.role !== "horticulturist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body = parsed.data;

  const touchesStructural =
    body.label !== undefined || body.is_required !== undefined || body.direction !== undefined;
  const touchesTranslation = body.label_hi !== undefined || body.label_kn !== undefined;

  // Horticulturist may edit translations ONLY — enforced server-side, not just UI.
  if (touchesStructural && auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Reorder is a dedicated path (swap order_index with the adjacent active row).
  if (body.direction) {
    return reorder(request, supabase, auth, body.id, body.direction);
  }

  const { data: current, error: readErr } = await supabase
    .from("checklist_template_items")
    .select("id, label, label_hi, label_kn, needs_translation_review")
    .eq("id", body.id)
    .single();
  if (readErr || !current) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.label !== undefined) update.label = body.label;
  if (body.is_required !== undefined) update.is_required = body.is_required;
  if (body.label_hi !== undefined) update.label_hi = body.label_hi;
  if (body.label_kn !== undefined) update.label_kn = body.label_kn;

  // Staleness (D4): an English label change flags the translations for review;
  // saving a translation clears the flag. If both happen in one call, the
  // translation save wins (translator is actively updating).
  const englishChanged = body.label !== undefined && body.label !== current.label;
  if (touchesTranslation) {
    update.needs_translation_review = false;
  } else if (englishChanged) {
    update.needs_translation_review = true;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("checklist_template_items")
    .update(update)
    .eq("id", body.id)
    .select("id, label, label_hi, label_kn, is_required, is_active, order_index, needs_translation_review")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: touchesTranslation && !englishChanged ? "checklist_item.translated" : "checklist_item.updated",
    targetTable: "checklist_template_items",
    targetId: body.id,
    metadata: { fields: Object.keys(update) },
    ...auditMeta(request),
  });
  return NextResponse.json({ data });
}

async function reorder(
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  auth: { userId: string; role: string },
  id: string,
  direction: "up" | "down"
) {
  const { data: rows } = await supabase
    .from("checklist_template_items")
    .select("id, order_index")
    .eq("is_active", true)
    .order("order_index");
  const list: { id: string; order_index: number }[] = rows ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) {
    return NextResponse.json({ error: "Already at edge" }, { status: 400 });
  }

  const a = list[idx];
  const b = list[swapIdx];
  await supabase.from("checklist_template_items").update({ order_index: b.order_index }).eq("id", a.id);
  await supabase.from("checklist_template_items").update({ order_index: a.order_index }).eq("id", b.id);

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "checklist_item.reordered",
    targetTable: "checklist_template_items",
    targetId: id,
    metadata: { direction },
    ...auditMeta(request),
  });
  return NextResponse.json({ data: { ok: true } });
}

// DELETE — soft-delete only (is_active=false). Admin only. Never hard delete.
export async function DELETE(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "checklist_item.deactivated",
    targetTable: "checklist_template_items",
    targetId: id,
    ...auditMeta(request),
  });
  return NextResponse.json({ data: { ok: true } });
}
