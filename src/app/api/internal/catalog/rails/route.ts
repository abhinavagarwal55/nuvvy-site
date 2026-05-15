import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import {
  railCreateSchema,
  type CuratedRail,
  type RailSegment,
} from "@/lib/catalog/railTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/internal/catalog/rails
// Query: ?segment=plants|accessories&status=draft,active&q=…
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const sp = request.nextUrl.searchParams;
  const segment = sp.get("segment");
  const statusParam = sp.get("status");
  const q = sp.get("q")?.trim();

  const supabase = getSupabaseAdmin();
  let query = supabase.from("curated_rails").select("*");
  if (segment === "plants" || segment === "accessories") {
    query = query.eq("segment", segment);
  }
  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) query = query.in("status", statuses);
  }
  if (q) {
    const term = q.replace(/[%]/g, "");
    query = query.ilike("title", `%${term}%`);
  }
  query = query.order("display_order", { ascending: true }).order("created_at", { ascending: false });

  const { data: rails, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const railIds = (rails ?? []).map((r) => r.id);
  let countsByRail: Record<string, number> = {};
  if (railIds.length > 0) {
    const { data: items } = await supabase
      .from("curated_rail_items")
      .select("rail_id")
      .in("rail_id", railIds);
    for (const row of items ?? []) {
      countsByRail[row.rail_id] = (countsByRail[row.rail_id] ?? 0) + 1;
    }
  }

  const result = (rails ?? []).map((r) => ({
    ...r,
    item_count: countsByRail[r.id] ?? 0,
  }));
  return NextResponse.json({ data: result });
}

// POST /api/internal/catalog/rails — create rail
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const parsed = railCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const supabase = getSupabaseAdmin();

  let displayOrder = input.display_order ?? null;
  if (displayOrder == null) {
    const { data: maxRow } = await supabase
      .from("curated_rails")
      .select("display_order")
      .eq("segment", input.segment as RailSegment)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    displayOrder = (maxRow?.display_order ?? 0) + 10;
  }

  const { data, error } = await supabase
    .from("curated_rails")
    .insert({
      title: input.title,
      segment: input.segment,
      subtitle: input.subtitle ?? null,
      status: "draft",
      display_order: displayOrder,
      cta_label: input.cta_label ?? null,
      cta_link: input.cta_link ?? null,
      notes_internal: input.notes_internal ?? null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select()
    .single<CuratedRail>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail.created",
    targetTable: "curated_rails",
    targetId: data.id,
    metadata: { title: data.title, segment: data.segment },
  });
  return NextResponse.json({ data }, { status: 201 });
}
