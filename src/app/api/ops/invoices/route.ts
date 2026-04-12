import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/invoices?customer_id=xxx&status=xxx
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
  const customerId = searchParams.get("customer_id");
  const plantOrderId = searchParams.get("plant_order_id");
  const status = searchParams.get("status");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, customer_id, plant_order_id, status, subtotal, discount, total, paid_at, finalized_at, created_at, customers(id, name, phone_number)")
    .order("created_at", { ascending: false });

  if (customerId) query = query.eq("customer_id", customerId);
  if (plantOrderId) query = query.eq("plant_order_id", plantOrderId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten customer info
  const shaped = (data ?? []).map((inv) => {
    const cust = inv.customers as unknown as { id: string; name: string; phone_number: string | null } | null;
    const { customers: _c, ...rest } = inv;
    void _c;
    return {
      ...rest,
      customer_name: cust?.name ?? null,
      customer_phone: cust?.phone_number ?? null,
    };
  });

  return NextResponse.json({ data: shaped });
}

// ---------------------------------------------------------------------------
// POST /api/ops/invoices — create invoice from a plant order
// ---------------------------------------------------------------------------
const CreateInvoiceSchema = z.object({
  plant_order_id: z.string().uuid("plant_order_id must be a valid UUID"),
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

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { plant_order_id } = parsed.data;

  // Verify order exists and get customer_id
  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, customer_id")
    .eq("id", plant_order_id)
    .single();

  if (orderError) {
    if (orderError.code === "PGRST116") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // Fetch procured/installed items with pricing
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("*")
    .eq("plant_order_id", plant_order_id)
    .in("status", ["procured", "installed"])
    .not("qty_procured", "is", null)
    .not("actual_unit_price", "is", null);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "No procured items to invoice" },
      { status: 409 }
    );
  }

  // Generate invoice number
  const { data: lastInvoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let nextNumber = 1;
  const currentYear = new Date().getFullYear();

  if (lastInvoice?.invoice_number) {
    const match = lastInvoice.invoice_number.match(/NUV-(\d{4})-(\d+)/);
    if (match) {
      const lastYear = parseInt(match[1], 10);
      const lastNum = parseInt(match[2], 10);
      if (lastYear === currentYear) {
        nextNumber = lastNum + 1;
      }
    }
  }

  const invoiceNumber = `NUV-${currentYear}-${String(nextNumber).padStart(4, "0")}`;

  // Compute line items and subtotal
  const invoiceItems = items.map((item, idx) => ({
    description: `${item.plant_name}${item.nursery_name ? ` (${item.nursery_name})` : ""}`,
    quantity: item.qty_procured as number,
    unit_price: item.actual_unit_price as number,
    total: (item.qty_procured as number) * (item.actual_unit_price as number),
    plant_order_item_id: item.id,
    sort_order: idx + 1,
  }));

  const subtotal = invoiceItems.reduce((sum, li) => sum + li.total, 0);

  // Insert invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      customer_id: order.customer_id,
      plant_order_id,
      status: "draft",
      subtotal,
      discount: 0,
      total: subtotal,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  // Insert invoice items
  const itemRows = invoiceItems.map((li) => ({
    invoice_id: invoice.id,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_price,
    total: li.total,
    plant_order_item_id: li.plant_order_item_id,
    sort_order: li.sort_order,
  }));

  const { error: itemInsertError } = await supabase
    .from("invoice_items")
    .insert(itemRows);

  if (itemInsertError) {
    return NextResponse.json(
      { error: itemInsertError.message },
      { status: 500 }
    );
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.created",
    targetTable: "invoices",
    targetId: invoice.id,
    metadata: {
      invoice_number: invoiceNumber,
      plant_order_id,
      item_count: items.length,
      subtotal,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    { data: { ...invoice, items: itemRows } },
    { status: 201 }
  );
}
