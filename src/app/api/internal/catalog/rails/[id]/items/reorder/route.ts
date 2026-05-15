import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import { itemReorderSchema } from "@/lib/catalog/railTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST — reorder items within a rail
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  const { id: railId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = itemReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { ordered_item_ids } = parsed.data;

  const supabase = getSupabaseAdmin();

  // Validate every id belongs to the rail
  const { data: existing } = await supabase
    .from("curated_rail_items")
    .select("id")
    .eq("rail_id", railId);
  const validIds = new Set((existing ?? []).map((r) => r.id));
  if (
    ordered_item_ids.length !== validIds.size ||
    !ordered_item_ids.every((id) => validIds.has(id))
  ) {
    return NextResponse.json(
      { error: "ordered_item_ids must contain every rail item exactly once" },
      { status: 400 }
    );
  }

  // Sequential UPDATE per row (small N at V1 volume; transaction not exposed by supabase-js)
  for (let i = 0; i < ordered_item_ids.length; i++) {
    const { error } = await supabase
      .from("curated_rail_items")
      .update({ position: i + 1 })
      .eq("id", ordered_item_ids[i])
      .eq("rail_id", railId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail_item.reordered",
    targetTable: "curated_rail_items",
    targetId: railId,
    metadata: { new_order: ordered_item_ids },
  });
  return NextResponse.json({ data: { ok: true } });
}
