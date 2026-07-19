import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { updateTemplateSchema, patchTemplateSchema } from "@/lib/schemas/curated-template";
import { resolveTemplateItemRows, TEMPLATE_ITEM_SELECT } from "@/lib/services/curated-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/ops/curated-templates/[id] — header + ordered items (joined display data).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: template, error } = await supabase
    .from("curated_list_templates")
    .select("id, name, description, status, type, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("curated_list_template_items")
    .select(TEMPLATE_ITEM_SELECT)
    .eq("template_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json({
    data: {
      ...template,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (items ?? []).map((i: any) => ({
        ...i,
        type: i.catalog_product_id ? "accessory" : "plant",
      })),
    },
  });
}

// PUT /api/ops/curated-templates/[id] — update name/description and REPLACE items.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("curated_list_templates")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (existing.status !== "active") {
    return NextResponse.json({ error: "Only active templates can be edited." }, { status: 422 });
  }

  const resolved = await resolveTemplateItemRows(supabase, parsed.data.items);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const updateFields: Record<string, unknown> = {
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.type) updateFields.type = parsed.data.type;

  const { error: updateError } = await supabase
    .from("curated_list_templates")
    .update(updateFields)
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Replace items wholesale (snapshot-on-use means lists already built are untouched).
  const { error: deleteError } = await supabase
    .from("curated_list_template_items")
    .delete()
    .eq("template_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (resolved.rows.length > 0) {
    const rows = resolved.rows.map((r) => ({ ...r, template_id: id }));
    const { error: insertError } = await supabase.from("curated_list_template_items").insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_template.updated",
    targetTable: "curated_list_templates",
    targetId: id,
    metadata: { name: parsed.data.name, item_count: parsed.data.items.length },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { id } });
}

// PATCH /api/ops/curated-templates/[id] — status change (soft-delete).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("curated_list_templates")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { error } = await supabase
    .from("curated_list_templates")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: parsed.data.status === "inactive" ? "curated_template.deactivated" : "curated_template.updated",
    targetTable: "curated_list_templates",
    targetId: id,
    metadata: { status: parsed.data.status },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { id, status: parsed.data.status } });
}
