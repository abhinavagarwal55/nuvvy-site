import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// DELETE — hard-delete the rail item (the underlying plant/product is preserved)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  let auth;
  try {
    auth = await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }
  const { id: railId, itemId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: before } = await supabase
    .from("curated_rail_items")
    .select("id, plant_id, catalog_product_id")
    .eq("id", itemId)
    .eq("rail_id", railId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("curated_rail_items")
    .delete()
    .eq("id", itemId)
    .eq("rail_id", railId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail_item.removed",
    targetTable: "curated_rail_items",
    targetId: itemId,
    metadata: {
      rail_id: railId,
      plant_id: before.plant_id,
      catalog_product_id: before.catalog_product_id,
    },
  });
  return NextResponse.json({ data: { id: itemId } });
}
