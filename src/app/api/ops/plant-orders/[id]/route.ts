import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  updatePlantOrderSchema,
  canTransition,
  type PlantOrderStatus,
  type PlantOrderItemStatus,
} from "@/lib/schemas/plant-order";

// Item replacement (editing intent) is only allowed before procurement begins.
const ITEM_EDITABLE_STATUSES: PlantOrderStatus[] = ["interested", "finalizing"];

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
// PUT /api/ops/plant-orders/[id] — pipeline transitions + follow-up + intent.
//
// All pipeline transitions are MANUAL here (FD-4). Logistics endpoints never
// touch plant_orders.status. Validates the transition map, the "confirmed needs
// ≥1 item" gate, and the "no_longer_interested needs closed_reason" rule.
// ---------------------------------------------------------------------------
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

  const parsed = updatePlantOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const rawBody = body as Record<string, unknown>;

  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("plant_orders")
    .select("id, status, next_follow_up_at, closed_reason")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentStatus = existing.status as PlantOrderStatus;
  const fields: Record<string, unknown> = {};

  // ── Status transition (optional) ───────────────────────────────────────────
  const targetStatus = d.status;
  const isTransition = targetStatus !== undefined && targetStatus !== currentStatus;

  if (isTransition) {
    if (!canTransition(currentStatus, targetStatus!)) {
      return NextResponse.json(
        { error: `Cannot move an order from '${currentStatus}' to '${targetStatus}'.` },
        { status: 422 }
      );
    }

    // confirmed requires ≥1 line item (count the post-update set if items given).
    if (targetStatus === "confirmed") {
      const effectiveCount = d.items ? d.items.length : await countItems(supabase, id);
      if (effectiveCount < 1) {
        return NextResponse.json(
          { error: "An order needs at least one line item before it can be confirmed." },
          { status: 422 }
        );
      }
    }

    if (targetStatus === "no_longer_interested") {
      if (!d.closed_reason) {
        return NextResponse.json(
          { error: "A reason is required to mark an order as no longer interested." },
          { status: 422 }
        );
      }
      fields.closed_reason = d.closed_reason;
    } else {
      // closed_reason only applies to no_longer_interested — clear it otherwise.
      fields.closed_reason = null;
    }

    fields.status = targetStatus;
  }

  // ── Follow-up (set/clear). Present in body (even as null) = intentional. ────
  const followUpProvided = "next_follow_up_at" in rawBody;
  if (followUpProvided) {
    fields.next_follow_up_at = d.next_follow_up_at || null;
  }

  // ── Other editable fields ──────────────────────────────────────────────────
  if (d.due_date !== undefined) fields.due_date = d.due_date;
  if (d.notes !== undefined) fields.notes = d.notes;
  if (d.request_source !== undefined) fields.request_source = d.request_source;
  if (d.shortlist_version_id !== undefined) fields.shortlist_version_id = d.shortlist_version_id;

  // ── Item (intent) replacement — only before procurement begins ─────────────
  if (d.items !== undefined) {
    if (!ITEM_EDITABLE_STATUSES.includes(currentStatus)) {
      return NextResponse.json(
        { error: "Line items can only be edited while the order is in 'interested' or 'finalizing'." },
        { status: 422 }
      );
    }

    const { error: deleteError } = await supabase
      .from("plant_order_items")
      .delete()
      .eq("plant_order_id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (d.items.length > 0) {
      const itemRows = d.items.map((item) => ({
        plant_order_id: id,
        plant_id: item.plant_id ?? null,
        plant_name: item.plant_name,
        quantity: item.quantity,
        note: item.note ?? null,
        status: "pending" satisfies PlantOrderItemStatus,
      }));
      const { error: insertError } = await supabase
        .from("plant_order_items")
        .insert(itemRows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    const { error: updateError } = await supabase
      .from("plant_orders")
      .update(fields)
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const ip = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");

  // Audit: status change and follow-up change are distinct, user-visible events.
  if (isTransition) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "plant_order.status_changed",
      targetTable: "plant_orders",
      targetId: id,
      metadata: { from: currentStatus, to: targetStatus, closed_reason: d.closed_reason ?? null },
      ip,
      userAgent,
    });
  }
  if (followUpProvided && (d.next_follow_up_at || null) !== (existing.next_follow_up_at || null)) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "plant_order.follow_up_set",
      targetTable: "plant_orders",
      targetId: id,
      metadata: { from: existing.next_follow_up_at, to: d.next_follow_up_at || null },
      ip,
      userAgent,
    });
  }

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

  return NextResponse.json({
    data: { ...updatedOrder, items: updatedItems ?? [] },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/ops/plant-orders/[id] — hard delete (cascades items + notes).
// Blocked if an invoice references the order (FK + audit-trail safety).
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
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase
    .from("plant_orders")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // An invoice references this order — don't orphan billing records.
  const { count: invoiceCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("plant_order_id", id);
  if ((invoiceCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete — an invoice exists for this order." },
      { status: 409 }
    );
  }

  // Unbind any order-scoped curated shortlist first — shortlists.plant_order_id
  // references this order and would otherwise block the delete. The shortlist
  // itself is preserved (non-destructive); it simply loses its order link.
  await supabase.from("shortlists").update({ plant_order_id: null }).eq("plant_order_id", id);

  // Cascades to plant_order_items and plant_order_notes via ON DELETE CASCADE.
  const { error } = await supabase.from("plant_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.deleted",
    targetTable: "plant_orders",
    targetId: id,
    metadata: { status: order.status },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

async function countItems(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<number> {
  const { count } = await supabase
    .from("plant_order_items")
    .select("id", { count: "exact", head: true })
    .eq("plant_order_id", orderId);
  return count ?? 0;
}
