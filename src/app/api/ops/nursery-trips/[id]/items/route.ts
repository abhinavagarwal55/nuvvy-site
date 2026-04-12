import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/nursery-trips/[id]/items — add items to trip
// ---------------------------------------------------------------------------
const AddItemsSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1, "At least one item_id required"),
});

export async function POST(
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

  const parsed = AddItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify trip exists
  const { data: trip, error: tripError } = await supabase
    .from("nursery_trips")
    .select("id, status")
    .eq("id", id)
    .single();

  if (tripError) {
    if (tripError.code === "PGRST116") {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json({ error: tripError.message }, { status: 500 });
  }

  if (trip.status !== "planned") {
    return NextResponse.json(
      { error: "Can only add items to a planned trip" },
      { status: 409 }
    );
  }

  // Validate each item is in 'requested' status
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("id, status, plant_order_id")
    .in("id", parsed.data.item_ids);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  if (!items || items.length !== parsed.data.item_ids.length) {
    return NextResponse.json(
      { error: "One or more item IDs not found" },
      { status: 404 }
    );
  }

  const nonRequested = items.filter((i) => i.status !== "requested");
  if (nonRequested.length > 0) {
    return NextResponse.json(
      {
        error: `Items must be in 'requested' status. Invalid items: ${nonRequested.map((i) => i.id).join(", ")}`,
      },
      { status: 409 }
    );
  }

  // Update items: set nursery_trip_id and status
  const { error: updateError } = await supabase
    .from("plant_order_items")
    .update({ nursery_trip_id: id, status: "trip_assigned" })
    .in("id", parsed.data.item_ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Update parent order statuses to 'trip_assigned' if applicable
  const orderIds = [...new Set(items.map((i) => i.plant_order_id))];
  for (const orderId of orderIds) {
    // Check if all items in the order are now at least trip_assigned
    const { data: orderItems } = await supabase
      .from("plant_order_items")
      .select("id, status")
      .eq("plant_order_id", orderId);

    if (orderItems) {
      const allAssignedOrBeyond = orderItems.every(
        (oi) => oi.status !== "requested"
      );
      if (allAssignedOrBeyond) {
        await supabase
          .from("plant_orders")
          .update({ status: "trip_assigned" })
          .eq("id", orderId);
      }
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order_item.trip_assigned",
    targetTable: "nursery_trips",
    targetId: id,
    metadata: { item_ids: parsed.data.item_ids },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { assigned: parsed.data.item_ids.length } });
}

// ---------------------------------------------------------------------------
// DELETE /api/ops/nursery-trips/[id]/items?item_id=... — remove item from trip
// ---------------------------------------------------------------------------
export async function DELETE(
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
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");

  if (!itemId) {
    return NextResponse.json(
      { error: "item_id query parameter is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify the item belongs to this trip
  const { data: item, error: itemError } = await supabase
    .from("plant_order_items")
    .select("id, status, nursery_trip_id")
    .eq("id", itemId)
    .single();

  if (itemError) {
    if (itemError.code === "PGRST116") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (item.nursery_trip_id !== id) {
    return NextResponse.json(
      { error: "Item does not belong to this trip" },
      { status: 409 }
    );
  }

  // Revert item
  const { error: updateError } = await supabase
    .from("plant_order_items")
    .update({ nursery_trip_id: null, status: "requested" })
    .eq("id", itemId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order_item.trip_removed",
    targetTable: "plant_order_items",
    targetId: itemId,
    metadata: { nursery_trip_id: id },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { removed: itemId } });
}
