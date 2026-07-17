import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { addPlantDraftItem, updateDraftItems } from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// PlantSelector returns plants.airtable_id (the plant-order identifier); shortlist
// draft items key on plants.id (uuid), so we accept either and resolve to the uuid.
const bodySchema = z
  .object({
    airtable_id: z.string().optional(),
    plant_uuid: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.airtable_id) || Boolean(v.plant_uuid), {
    message: "airtable_id or plant_uuid is required",
  });

// POST /api/ops/plant-orders/[id]/curated-list/items — add a plant to the list.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();
  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order.curated_shortlist_id) {
    return NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 });
  }
  // Confirmed lists are locked (V1) — items are only editable pre-confirmation.
  if (!["interested", "finalizing"].includes(order.status)) {
    return NextResponse.json(
      { error: "The curated list is locked once the order leaves 'interested' / 'finalizing'." },
      { status: 422 }
    );
  }

  // Resolve to the full plant row so we can echo it back for an optimistic
  // client append (avoids a follow-up GET round-trip).
  const plantCols = "id, name, scientific_name, price_band, thumbnail_url, thumbnail_storage_url";
  const plantQuery = supabase.from("plants").select(plantCols);
  const { data: plant } = parsed.data.plant_uuid
    ? await plantQuery.eq("id", parsed.data.plant_uuid).maybeSingle()
    : await plantQuery.eq("airtable_id", parsed.data.airtable_id!).maybeSingle();

  if (!plant) {
    return NextResponse.json({ error: "Plant not found in catalog." }, { status: 404 });
  }

  const result = await addPlantDraftItem(supabase, order.curated_shortlist_id, plant.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Return the draft-item id + the plant so the editor can render immediately.
  return NextResponse.json({
    data: {
      id: (result.data as { id: string }).id,
      plant_id: plant.id,
      plant: {
        id: plant.id,
        name: plant.name,
        scientific_name: plant.scientific_name ?? null,
        price_band: plant.price_band ?? null,
        thumbnail_url: plant.thumbnail_url ?? null,
        thumbnail_storage_url: plant.thumbnail_storage_url ?? null,
      },
    },
  });
}

// PUT /api/ops/plant-orders/[id]/curated-list/items — save per-item quantity/note.
const saveSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        quantity: z.number().int().min(1).nullable().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .default([]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();
  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order.curated_shortlist_id) {
    return NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 });
  }
  if (!["interested", "finalizing"].includes(order.status)) {
    return NextResponse.json(
      { error: "The curated list is locked once the order leaves 'interested' / 'finalizing'." },
      { status: 422 }
    );
  }

  const result = await updateDraftItems(supabase, order.curated_shortlist_id, parsed.data.items);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: { success: true } });
}
