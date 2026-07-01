import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  createPlantOrderSchema,
  TERMINAL_ORDER_STATUSES,
  LIVE_ORDER_STATUSES,
  type PlantOrderItemStatus,
} from "@/lib/schemas/plant-order";

// Derived, best-effort procurement rollup for an order (PRD §4). Read-only;
// renders cleanly when there are no items.
function buildRollup(items: { status: string }[]) {
  const by: Record<string, number> = {};
  for (const it of items) by[it.status] = (by[it.status] ?? 0) + 1;
  return {
    total: items.length,
    procured: by["procured"] ?? 0,
    on_trip: by["on_trip"] ?? 0,
    pending: by["pending"] ?? 0,
    partial: by["partial"] ?? 0,
    deferred: by["deferred"] ?? 0,
    cancelled: by["cancelled"] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// GET /api/ops/plant-orders
//   ?status=interested            — exact pipeline status
//   ?follow_ups_due=1             — next_follow_up_at <= today, live states only
//   ?customer_id= &due_before= &due_after= &overdue=true &include_items=true
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customer_id");
  const dueBefore = searchParams.get("due_before");
  const dueAfter = searchParams.get("due_after");
  const overdue = searchParams.get("overdue");
  const followUpsDue = searchParams.get("follow_ups_due");
  const today = new Date().toISOString().split("T")[0];

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("plant_orders")
    .select(
      "id, customer_id, status, due_date, next_follow_up_at, closed_reason, shortlist_version_id, request_source, notes, created_at, updated_at, customers(id, name, society_id, societies(name))"
    );

  if (followUpsDue === "1") {
    // Oldest-due first across all live states (PRD §5).
    query = query
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", today)
      .in("status", LIVE_ORDER_STATUSES)
      .order("next_follow_up_at", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);
  if (dueBefore) query = query.lte("due_date", dueBefore);
  if (dueAfter) query = query.gte("due_date", dueAfter);
  if (overdue === "true") {
    query = query
      .lt("due_date", today)
      .not("status", "in", `(${TERMINAL_ORDER_STATUSES.join(",")})`);
  }

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const includeItems = searchParams.get("include_items") === "true";
  const orderIds = orders.map((o) => o.id);
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("id, plant_order_id, plant_id, plant_name, quantity, note, status")
    .in("plant_order_id", orderIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const byOrder: Record<string, typeof items> = {};
  for (const it of items ?? []) {
    (byOrder[it.plant_order_id] ??= []).push(it);
  }

  const result = orders.map((o) => {
    const customer = o.customers as unknown as {
      id: string;
      name: string;
      society_id: string | null;
      societies: { name: string } | null;
    } | null;
    const orderItems = byOrder[o.id] ?? [];

    return {
      id: o.id,
      customer_id: o.customer_id,
      status: o.status,
      due_date: o.due_date,
      next_follow_up_at: o.next_follow_up_at,
      closed_reason: o.closed_reason,
      shortlist_version_id: o.shortlist_version_id,
      request_source: o.request_source,
      notes: o.notes,
      created_at: o.created_at,
      updated_at: o.updated_at,
      customer_name: customer?.name ?? null,
      society_name: customer?.societies?.name ?? null,
      item_count: orderItems.length,
      total_quantity: orderItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0),
      items_summary: orderItems.map((i) => `${i.plant_name} x${i.quantity}`).join(", "),
      // Best-effort, read-only procurement rollup (PRD §4).
      procurement: buildRollup(orderItems),
      ...(includeItems ? { items: orderItems } : {}),
    };
  });

  return NextResponse.json({ data: result });
}

// ---------------------------------------------------------------------------
// POST /api/ops/plant-orders — create a pipeline order (may have ZERO items).
// Always created at `interested`. Items default to procurement status `pending`.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPlantOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { customer_id, items, status, request_source, notes, next_follow_up_at, shortlist_version_id } =
    parsed.data;

  // confirmed requires ≥1 line item (FD-10), same gate as the PUT transition.
  if (status === "confirmed" && items.length < 1) {
    return NextResponse.json(
      { error: "An order needs at least one plant to be created as Confirmed." },
      { status: 422 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .insert({
      customer_id,
      due_date: parsed.data.due_date || null,
      request_source,
      notes: notes ?? null,
      next_follow_up_at: next_follow_up_at || null,
      shortlist_version_id: shortlist_version_id ?? null,
      status,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  let insertedItems: unknown[] = [];
  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      plant_order_id: order.id,
      plant_id: item.plant_id ?? null,
      plant_name: item.plant_name,
      quantity: item.quantity,
      note: item.note ?? null,
      status: "pending" satisfies PlantOrderItemStatus,
    }));

    const { data, error: itemsError } = await supabase
      .from("plant_order_items")
      .insert(itemRows)
      .select();

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
    insertedItems = data ?? [];
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.created",
    targetTable: "plant_orders",
    targetId: order.id,
    metadata: { customer_id, item_count: items.length, status },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    { data: { ...order, items: insertedItems } },
    { status: 201 }
  );
}
