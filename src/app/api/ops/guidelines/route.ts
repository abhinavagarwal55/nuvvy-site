import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { translateGuideline } from "@/lib/i18n/translateOnWrite";

// Editable service guidelines (gardener Do's / Don'ts). English is admin-edited
// and AI-translated on write; hi/kn may also be edited directly (admin + horti).
// Soft-delete only. All roles may read (gardeners see them on the visit screen).

function auditMeta(request: NextRequest) {
  return {
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  };
}

const SELECT =
  "id, kind, text, text_hi, text_kn, translation_status, order_index, is_active";

// GET — list active guidelines (all ops roles). ?all=1 includes inactive (editor).
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const includeInactive =
    new URL(request.url).searchParams.get("all") === "1" &&
    (auth.role === "admin" || auth.role === "horticulturist");

  const supabase = getSupabaseAdmin();
  let query = supabase.from("service_guidelines").select(SELECT);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("kind").order("order_index");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const CreateSchema = z.object({
  kind: z.enum(["do", "dont"]),
  text: z.string().min(1, "Text is required").max(500),
});

// POST — create a guideline (admin only). AI-translates on write.
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
    .from("service_guidelines")
    .select("order_index")
    .eq("kind", parsed.data.kind)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.order_index ?? 0) + 1;

  const { data, error } = await supabase
    .from("service_guidelines")
    .insert({
      kind: parsed.data.kind,
      text: parsed.data.text,
      is_active: true,
      order_index: nextOrder,
      // translation_status defaults 'pending' → filled by translate-on-write.
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await translateGuideline(supabase, data.id, parsed.data.text);

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "guideline.created",
    targetTable: "service_guidelines",
    targetId: data.id,
    metadata: { kind: data.kind },
    ...auditMeta(request),
  });
  return NextResponse.json({ data }, { status: 201 });
}

const PatchSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(500).optional(), // English (admin)
    text_hi: z.string().max(500).nullable().optional(), // admin + horti
    text_kn: z.string().max(500).nullable().optional(), // admin + horti
    direction: z.enum(["up", "down"]).optional(), // reorder (admin)
  })
  .strict();

// PATCH — edit English + reorder (admin), or edit hi/kn (admin + horti).
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

  const touchesStructural = body.text !== undefined || body.direction !== undefined;
  const touchesTranslation = body.text_hi !== undefined || body.text_kn !== undefined;
  if (touchesStructural && auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  if (body.direction) {
    const { data: current } = await supabase
      .from("service_guidelines")
      .select("id, kind, order_index")
      .eq("id", body.id)
      .single();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: siblings } = await supabase
      .from("service_guidelines")
      .select("id, order_index")
      .eq("kind", current.kind)
      .eq("is_active", true)
      .order("order_index");
    const list: { id: string; order_index: number }[] = siblings ?? [];
    const idx = list.findIndex((r) => r.id === body.id);
    const swapIdx = body.direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) {
      return NextResponse.json({ error: "Already at edge" }, { status: 400 });
    }
    const a = list[idx];
    const b = list[swapIdx];
    await supabase.from("service_guidelines").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("service_guidelines").update({ order_index: a.order_index }).eq("id", b.id);
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "guideline.reordered",
      targetTable: "service_guidelines",
      targetId: body.id,
      ...auditMeta(request),
    });
    return NextResponse.json({ data: { ok: true } });
  }

  const update: Record<string, unknown> = {};
  if (body.text !== undefined) update.text = body.text;
  if (body.text_hi !== undefined) update.text_hi = body.text_hi;
  if (body.text_kn !== undefined) update.text_kn = body.text_kn;

  // Editing English invalidates the translation — reset to pending + clear stale
  // variants, then AI re-translate below.
  if (body.text !== undefined) {
    update.text_hi = null;
    update.text_kn = null;
    update.translation_status = "pending";
    update.translated_at = null;
  } else if (touchesTranslation) {
    // Manual hi/kn edit — mark done (a human provided the translation).
    update.translation_status = "done";
    update.translated_at = new Date().toISOString();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("service_guidelines")
    .update(update)
    .eq("id", body.id)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.text !== undefined) {
    await translateGuideline(supabase, body.id, body.text);
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: body.text !== undefined ? "guideline.updated" : "guideline.translated",
    targetTable: "service_guidelines",
    targetId: body.id,
    ...auditMeta(request),
  });
  return NextResponse.json({ data });
}

// DELETE — soft-delete (is_active=false). Admin only.
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

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_guidelines")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "guideline.deactivated",
    targetTable: "service_guidelines",
    targetId: id,
    ...auditMeta(request),
  });
  return NextResponse.json({ data: { ok: true } });
}
