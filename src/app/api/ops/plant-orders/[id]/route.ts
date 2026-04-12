import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/plant-orders/[id] — order detail with items + customer info
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

  // Fetch order with customer info
  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select(
      "*, customers(id, name, phone_number, address, society_id, societies(name))"
    )
    .eq("id", id)
    .single();

  if (orderError) {
    if (orderError.code === "PGRST116") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // Fetch items
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("*")
    .eq("plant_order_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Fetch plant thumbnails for items with plant_id
  const plantIds = (items ?? []).map((i) => i.plant_id).filter(Boolean) as string[];
  let thumbnailMap: Record<string, string | null> = {};
  if (plantIds.length > 0) {
    const { data: plants } = await supabase
      .from("plants")
      .select("airtable_id, thumbnail_storage_url")
      .in("airtable_id", plantIds);
    thumbnailMap = Object.fromEntries(
      (plants ?? []).map((p) => [p.airtable_id, p.thumbnail_storage_url])
    );
  }

  const customer = order.customers as unknown as {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    society_id: string | null;
    societies: { name: string } | null;
  } | null;

  // Restructure: pull customer out to top-level key, remove nested "customers"
  const { customers: _customers, ...orderFields } = order;
  void _customers;

  return NextResponse.json({
    data: {
      ...orderFields,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            phone_number: customer.phone_number,
            address: customer.address,
            society_id: customer.society_id,
            society_name: customer.societies?.name ?? null,
          }
        : null,
      items: (items ?? []).map((i) => ({
        ...i,
        thumbnail_url: i.plant_id ? thumbnailMap[i.plant_id] ?? null : null,
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/ops/plant-orders/[id] — edit order (only when status='requested')
// ---------------------------------------------------------------------------
const UpdateOrderItemSchema = z.object({
  plant_id: z.string().optional(),
  plant_name: z.string().min(1),
  quantity: z.number().int().min(1),
  note: z.string().optional(),
});

const UpdateOrderSchema = z.object({
  due_date: z.string().optional(),
  notes: z.string().optional(),
  request_source: z
    .enum(["customer_requested", "replacement"])
    .optional(),
  items: z.array(UpdateOrderItemSchema).min(1).optional(),
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

  const parsed = UpdateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify order exists and is editable
  const { data: existing, error: fetchError } = await supabase
    .from("plant_orders")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing.status !== "requested") {
    return NextResponse.json(
      { error: "Only orders with status 'requested' can be edited" },
      { status: 409 }
    );
  }

  const { items, ...orderUpdates } = parsed.data;

  // Update order fields if any provided
  const fieldsToUpdate: Record<string, unknown> = {};
  if (orderUpdates.due_date !== undefined)
    fieldsToUpdate.due_date = orderUpdates.due_date;
  if (orderUpdates.notes !== undefined)
    fieldsToUpdate.notes = orderUpdates.notes;
  if (orderUpdates.request_source !== undefined)
    fieldsToUpdate.request_source = orderUpdates.request_source;

  if (Object.keys(fieldsToUpdate).length > 0) {
    const { error: updateError } = await supabase
      .from("plant_orders")
      .update(fieldsToUpdate)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }
  }

  // Replace items if provided
  if (items) {
    // Delete existing items
    const { error: deleteError } = await supabase
      .from("plant_order_items")
      .delete()
      .eq("plant_order_id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    // Insert new items
    const itemRows = items.map((item) => ({
      plant_order_id: id,
      plant_id: item.plant_id ?? null,
      plant_name: item.plant_name,
      quantity: item.quantity,
      note: item.note ?? null,
      status: "requested",
    }));

    const { error: insertError } = await supabase
      .from("plant_order_items")
      .insert(itemRows);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }
  }

  // Fetch updated order with items
  const { data: updatedOrder } = await supabase
    .from("plant_orders")
    .select("*")
    .eq("id", id)
    .single();

  const { data: updatedItems } = await supabase
    .from("plant_order_items")
    .select("*")
    .eq("plant_order_id", id)
    .order("created_at", { ascending: true });

  // Audit log
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.updated",
    targetTable: "plant_orders",
    targetId: id,
    metadata: { fields_updated: Object.keys(fieldsToUpdate), items_replaced: !!items },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { ...updatedOrder, items: updatedItems ?? [] },
  });
}
