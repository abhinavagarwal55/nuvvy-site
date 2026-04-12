import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/nursery-trips/[id] — trip detail with linked items
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: trip, error: tripError } = await supabase
    .from("nursery_trips")
    .select("*")
    .eq("id", id)
    .single();

  if (tripError) {
    if (tripError.code === "PGRST116") {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json({ error: tripError.message }, { status: 500 });
  }

  // Fetch linked items with customer info via plant_orders
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("*, plant_orders(id, customer_id, customers(id, name))")
    .eq("nursery_trip_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Fetch plant thumbnails + price_band
  const plantIds = (items ?? []).map((i) => i.plant_id).filter(Boolean) as string[];
  let plantInfoMap: Record<string, { thumbnail_url: string | null; price_band: string | null }> = {};
  if (plantIds.length > 0) {
    const { data: plants } = await supabase
      .from("plants")
      .select("airtable_id, thumbnail_storage_url, price_band")
      .in("airtable_id", plantIds);
    plantInfoMap = Object.fromEntries(
      (plants ?? []).map((p) => [p.airtable_id, { thumbnail_url: p.thumbnail_storage_url, price_band: p.price_band }])
    );
  }

  // Reshape items to include customer name and thumbnail at top level
  const shapedItems = (items ?? []).map((item) => {
    const order = item.plant_orders as unknown as {
      id: string;
      customer_id: string;
      customers: { id: string; name: string } | null;
    } | null;
    const { plant_orders: _po, ...rest } = item;
    void _po;
    return {
      ...rest,
      order_id: order?.id ?? null,
      customer_id: order?.customer_id ?? null,
      customer_name: order?.customers?.name ?? null,
      thumbnail_url: item.plant_id ? plantInfoMap[item.plant_id]?.thumbnail_url ?? null : null,
      price_band: item.plant_id ? plantInfoMap[item.plant_id]?.price_band ?? null : null,
    };
  });

  return NextResponse.json({
    data: { ...trip, items: shapedItems },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/ops/nursery-trips/[id] — edit trip (only when status='planned')
// ---------------------------------------------------------------------------
const UpdateTripSchema = z.object({
  trip_date: z.string().optional(),
  nursery_name: z.string().optional(),
  notes: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify trip exists and is editable
  const { data: existing, error: fetchError } = await supabase
    .from("nursery_trips")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing.status !== "planned") {
    return NextResponse.json(
      { error: "Only trips with status 'planned' can be edited" },
      { status: 409 }
    );
  }

  const fieldsToUpdate: Record<string, unknown> = {};
  if (parsed.data.trip_date !== undefined)
    fieldsToUpdate.trip_date = parsed.data.trip_date;
  if (parsed.data.nursery_name !== undefined)
    fieldsToUpdate.nursery_name = parsed.data.nursery_name;
  if (parsed.data.notes !== undefined)
    fieldsToUpdate.notes = parsed.data.notes;

  if (Object.keys(fieldsToUpdate).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("nursery_trips")
    .update(fieldsToUpdate)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "nursery_trip.updated",
    targetTable: "nursery_trips",
    targetId: id,
    metadata: { fields_updated: Object.keys(fieldsToUpdate) },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
