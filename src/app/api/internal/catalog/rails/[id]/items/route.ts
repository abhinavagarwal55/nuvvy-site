import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import { railItemAddSchema } from "@/lib/catalog/railTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/internal/catalog/rails/[id]/items — add item
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
  const parsed = railItemAddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { plant_id, catalog_product_id } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { data: rail } = await supabase
    .from("curated_rails")
    .select("id, segment")
    .eq("id", railId)
    .maybeSingle();
  if (!rail) return NextResponse.json({ error: "Rail not found" }, { status: 404 });

  // Cross-segment integrity
  if (plant_id && rail.segment !== "plants") {
    return NextResponse.json(
      { error: "This rail accepts accessories only." },
      { status: 400 }
    );
  }
  if (catalog_product_id && rail.segment !== "accessories") {
    return NextResponse.json(
      { error: "This rail accepts plants only." },
      { status: 400 }
    );
  }

  // Duplicate check
  const dupCol = plant_id ? "plant_id" : "catalog_product_id";
  const dupVal = plant_id ?? catalog_product_id!;
  const { data: existing } = await supabase
    .from("curated_rail_items")
    .select("id, position")
    .eq("rail_id", railId)
    .eq(dupCol, dupVal)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ data: existing }, { status: 200 });
  }

  // Next position
  const { data: lastRow } = await supabase
    .from("curated_rail_items")
    .select("position")
    .eq("rail_id", railId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (lastRow?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("curated_rail_items")
    .insert({
      rail_id: railId,
      plant_id: plant_id ?? null,
      catalog_product_id: catalog_product_id ?? null,
      position: nextPosition,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail_item.added",
    targetTable: "curated_rail_items",
    targetId: data.id,
    metadata: {
      rail_id: railId,
      item_type: plant_id ? "plant" : "accessory",
      plant_id: plant_id ?? null,
      catalog_product_id: catalog_product_id ?? null,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}
