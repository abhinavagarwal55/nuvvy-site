import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  PLANT_INVOICE_SERVICE_LINES_KEY,
  parseServiceLines,
} from "@/lib/billing/plant-invoice-template";

/** Today as YYYY-MM-DD in IST, matching the rest of the billing module. */
function todayIst(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/ops/invoices?customer_id=xxx&plant_order_id=xxx&status=xxx
// Read — admin or horticulturist (the plant-order detail page reads this).
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
    .select(
      "id, invoice_number, customer_id, plant_order_id, status, subtotal, discount, total, invoice_date, paid_at, finalized_at, whatsapp_sent_at, created_at, customers(id, name, phone_number)"
    )
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
// POST /api/ops/invoices — create a sectioned invoice from a plant order.
// Admin only. Seeds Section B from ALL plant items (blank price) and Section A
// from the default service lines (blank qty/price). PRD §6.2.
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

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
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

  // Verify order exists and get customer_id.
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

  // One non-cancelled invoice per order — return the existing one if present.
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("plant_order_id", plant_order_id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (existingInvoice) {
    return NextResponse.json(
      {
        error: "An invoice already exists for this order",
        existing_invoice_id: existingInvoice.id,
      },
      { status: 409 }
    );
  }

  // Seed Section B from ALL plant items (intent), price blank.
  const { data: items, error: itemsError } = await supabase
    .from("plant_order_items")
    .select("id, plant_name, quantity, note")
    .eq("plant_order_id", plant_order_id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Seed Section A from the configured default service lines.
  const { data: cfg } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", PLANT_INVOICE_SERVICE_LINES_KEY)
    .maybeSingle();
  const serviceLines = parseServiceLines(cfg?.value);

  // Generate invoice number (NUV-YYYY-####).
  const { data: lastInvoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNumber = 1;
  const currentYear = new Date(todayIst()).getFullYear();
  if (lastInvoice?.invoice_number) {
    const match = lastInvoice.invoice_number.match(/NUV-(\d{4})-(\d+)/);
    if (match) {
      const lastYear = parseInt(match[1], 10);
      const lastNum = parseInt(match[2], 10);
      if (lastYear === currentYear) nextNumber = lastNum + 1;
    }
  }
  const invoiceNumber = `NUV-${currentYear}-${String(nextNumber).padStart(4, "0")}`;

  // Insert invoice — all money zero; prices filled later by the editor.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      customer_id: order.customer_id,
      plant_order_id,
      status: "draft",
      invoice_date: todayIst(),
      subtotal: 0,
      discount: 0,
      total: 0,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  // Build seeded line items: Section A (service) then Section B (plants).
  const serviceRows = serviceLines.map((description, idx) => ({
    invoice_id: invoice.id,
    description,
    quantity: null,
    unit_price: null,
    total: 0,
    section: "service",
    plant_order_item_id: null,
    sort_order: idx + 1,
  }));

  const plantRows = (items ?? []).map((item, idx) => ({
    invoice_id: invoice.id,
    description: item.note
      ? `${item.plant_name} (${item.note})`
      : item.plant_name,
    quantity: item.quantity ?? 1,
    unit_price: null,
    total: 0,
    section: "plants",
    plant_order_item_id: item.id,
    sort_order: idx + 1,
  }));

  const itemRows = [...serviceRows, ...plantRows];

  if (itemRows.length > 0) {
    const { error: itemInsertError } = await supabase
      .from("invoice_items")
      .insert(itemRows);

    if (itemInsertError) {
      return NextResponse.json(
        { error: itemInsertError.message },
        { status: 500 }
      );
    }
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
      service_line_count: serviceRows.length,
      plant_line_count: plantRows.length,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    { data: { ...invoice, items: itemRows } },
    { status: 201 }
  );
}
