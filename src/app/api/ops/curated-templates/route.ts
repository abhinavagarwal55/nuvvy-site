import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { createTemplateSchema } from "@/lib/schemas/curated-template";
import { resolveTemplateItemRows } from "@/lib/services/curated-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/ops/curated-templates?q=&status=active — list with item_count.
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const status = sp.get("status") ?? "active";

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("curated_list_templates")
    .select(
      `id, name, description, status, created_at, updated_at,
       curated_list_template_items ( sort_order, plant:plants(name), catalog_product:catalog_products(name) )`
    )
    .order("updated_at", { ascending: false });

  if (status === "active" || status === "inactive") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.ilike("name", `%${q.replace(/[%]/g, "")}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = (data ?? []).map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItems: any[] = Array.isArray((t as any).curated_list_template_items)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t as any).curated_list_template_items
      : [];
    const item_names = rawItems
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => i.plant?.name || i.catalog_product?.name)
      .filter(Boolean) as string[];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at,
      item_count: rawItems.length,
      item_names,
    };
  });

  return NextResponse.json({ data: templates });
}

// POST /api/ops/curated-templates — create a template + items.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: template, error: insertError } = await supabase
    .from("curated_list_templates")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      status: "active",
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (insertError || !template) {
    return NextResponse.json({ error: insertError?.message || "Failed to create template" }, { status: 500 });
  }

  if (parsed.data.items.length > 0) {
    const resolved = await resolveTemplateItemRows(supabase, parsed.data.items);
    if (!resolved.ok) {
      await supabase.from("curated_list_templates").delete().eq("id", template.id);
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const rows = resolved.rows.map((r) => ({ ...r, template_id: template.id }));
    const { error: itemsError } = await supabase.from("curated_list_template_items").insert(rows);
    if (itemsError) {
      await supabase.from("curated_list_templates").delete().eq("id", template.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_template.created",
    targetTable: "curated_list_templates",
    targetId: template.id,
    metadata: { name: parsed.data.name, item_count: parsed.data.items.length },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { id: template.id } }, { status: 201 });
}
