import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";
import {
  railUpdateSchema,
  type CuratedRail,
} from "@/lib/catalog/railTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/internal/catalog/rails/[id] — rail + items with joined details
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

  const { data: rail, error: railErr } = await supabase
    .from("curated_rails")
    .select("*")
    .eq("id", id)
    .maybeSingle<CuratedRail>();
  if (railErr) return NextResponse.json({ error: railErr.message }, { status: 500 });
  if (!rail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: items, error: itemsErr } = await supabase
    .from("curated_rail_items")
    .select(`
      id,
      position,
      plant_id,
      catalog_product_id,
      plant:plants ( id, airtable_id, name, scientific_name, price_band, thumbnail_url, thumbnail_storage_url, can_be_procured ),
      catalog_product:catalog_products ( id, name, brand, category, price_inr, price_snapshot_at, status, amazon_asin, thumbnail_url, thumbnail_storage_url )
    `)
    .eq("rail_id", id)
    .order("position", { ascending: true });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const transformed = (items ?? []).map((row) => {
    const plant = row.plant as { can_be_procured?: boolean } | null;
    const product = row.catalog_product as { status?: string } | null;
    const isAccessory = !!row.catalog_product_id;
    const underlyingAvailable = isAccessory
      ? product?.status === "active"
      : !!plant?.can_be_procured;
    return {
      ...row,
      type: isAccessory ? ("accessory" as const) : ("plant" as const),
      underlying_available: underlyingAvailable,
    };
  });

  return NextResponse.json({ data: { rail, items: transformed } });
}

// PATCH — update metadata (cannot change segment)
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

  // Reject any attempt to change the segment
  if (body && Object.prototype.hasOwnProperty.call(body, "segment")) {
    return NextResponse.json(
      { error: "Rail segment is immutable after creation." },
      { status: 400 }
    );
  }

  const parsed = railUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: before, error: beforeErr } = await supabase
    .from("curated_rails")
    .select("*")
    .eq("id", id)
    .maybeSingle<CuratedRail>();
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { ...parsed.data, updated_by: auth.userId };
  const { data: after, error } = await supabase
    .from("curated_rails")
    .update(updates)
    .eq("id", id)
    .select()
    .single<CuratedRail>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statusChanged = "status" in parsed.data && before.status !== after.status;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
    const k = key as string;
    if ((before as unknown as Record<string, unknown>)[k] !== (after as unknown as Record<string, unknown>)[k]) {
      diff[k] = {
        from: (before as unknown as Record<string, unknown>)[k],
        to: (after as unknown as Record<string, unknown>)[k],
      };
    }
  }
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: statusChanged ? "curated_rail.status_changed" : "curated_rail.updated",
    targetTable: "curated_rails",
    targetId: id,
    metadata: { title: after.title, diff },
  });
  return NextResponse.json({ data: after });
}

// DELETE — soft delete (status='inactive')
export async function DELETE(
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
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("curated_rails")
    .update({ status: "inactive", updated_by: auth.userId })
    .eq("id", id)
    .select()
    .single<CuratedRail>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "curated_rail.soft_deleted",
    targetTable: "curated_rails",
    targetId: id,
    metadata: { title: data.title },
  });
  return NextResponse.json({ data });
}
