import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/plant-orders?status=requested&customer_id=xxx&due_before=...&due_after=...&overdue=true
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

  const supabase = getSupabaseAdmin();

  // Build query with customer + society join
  let query = supabase
    .from("plant_orders")
    .select(
      "id, customer_id, status, due_date, request_source, notes, created_at, updated_at, customers(id, name, society_id, societies(name))"
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);
  if (dueBefore) query = query.lte("due_date", dueBefore);
  if (dueAfter) query = query.gte("due_date", dueAfter);
  if (overdue === "true") {
    const today = new Date().toISOString().split("T")[0];
    query = query.lt("due_date", today).not("status", "in", "(cancelled,completed)");
  }

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Fetch items for all orders in one query
  const includeItems = searchParams.get("include_items") === "true";
  const orderIds = orders.map((o) => o.id);
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("id, plant_order_id, plant_id, plant_name, quantity, note, status")
    .in("plant_order_id", orderIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Build per-order item count and summary
  const itemMap: Record<string, { count: number; summary: string }> = {};
  for (const orderId of orderIds) {
    const orderItems = (items ?? []).filter((i) => i.plant_order_id === orderId);
    const count = orderItems.length;
    const summary = orderItems
      .map((i) => `${i.plant_name} x${i.quantity}`)
      .join(", ");
    itemMap[orderId] = { count, summary };
  }

  const result = orders.map((o) => {
    const customer = o.customers as unknown as {
      id: string;
      name: string;
      society_id: string | null;
      societies: { name: string } | null;
    } | null;

    return {
      id: o.id,
      customer_id: o.customer_id,
      status: o.status,
      due_date: o.due_date,
      request_source: o.request_source,
      notes: o.notes,
      created_at: o.created_at,
      updated_at: o.updated_at,
      customer_name: customer?.name ?? null,
      society_name: customer?.societies?.name ?? null,
      item_count: itemMap[o.id]?.count ?? 0,
      items_summary: itemMap[o.id]?.summary ?? "",
      ...(includeItems ? {
        items: (items ?? []).filter((i) => i.plant_order_id === o.id),
      } : {}),
    };
  });

  return NextResponse.json({ data: result });
}

// ---------------------------------------------------------------------------
// POST /api/ops/plant-orders — create a new plant order with items
// ---------------------------------------------------------------------------
const CreateOrderItemSchema = z.object({
  plant_id: z.string().optional(),
  plant_name: z.string().min(1),
  quantity: z.number().int().min(1),
  note: z.string().optional(),
});

const CreateOrderSchema = z.object({
  customer_id: z.string().uuid(),
  items: z.array(CreateOrderItemSchema).min(1),
  due_date: z.string().optional(), // YYYY-MM-DD, default today+10
  request_source: z.enum(["customer_requested", "replacement"]),
  notes: z.string().optional(),
});

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

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { customer_id, items, request_source, notes } = parsed.data;

  // Default due_date: today + 10 days
  const dueDate =
    parsed.data.due_date ??
    new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const supabase = getSupabaseAdmin();

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .insert({
      customer_id,
      due_date: dueDate,
      request_source,
      notes: notes ?? null,
      status: "requested",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // Insert items
  const itemRows = items.map((item) => ({
    plant_order_id: order.id,
    plant_id: item.plant_id ?? null,
    plant_name: item.plant_name,
    quantity: item.quantity,
    note: item.note ?? null,
    status: "requested",
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from("plant_order_items")
    .insert(itemRows)
    .select();

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Audit log (fire and forget)
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plant_order.created",
    targetTable: "plant_orders",
    targetId: order.id,
    metadata: { customer_id, item_count: items.length },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    { data: { ...order, items: insertedItems ?? [] } },
    { status: 201 }
  );
}
