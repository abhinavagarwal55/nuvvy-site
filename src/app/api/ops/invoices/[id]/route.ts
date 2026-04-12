import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/invoices/[id] — invoice detail with items
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

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, customers(id, name, phone_number, address, societies(name))")
    .eq("id", id)
    .single();

  if (invoiceError) {
    if (invoiceError.code === "PGRST116") {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: invoiceError.message },
      { status: 500 }
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Flatten customer
  const cust = invoice.customers as unknown as {
    id: string; name: string; phone_number: string | null;
    address: string | null; societies: { name: string } | null;
  } | null;
  const { customers: _c, ...invoiceRest } = invoice;
  void _c;

  return NextResponse.json({
    data: {
      ...invoiceRest,
      customer: cust,
      items: items ?? [],
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/ops/invoices/[id] — edit invoice (only when status='draft')
// ---------------------------------------------------------------------------
const InvoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0),
  unit_price: z.number().min(0),
  sort_order: z.number().int().min(0),
});

const UpdateInvoiceSchema = z.object({
  items: z.array(InvoiceItemSchema).min(1),
  discount: z.number().min(0).optional(),
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

  const parsed = UpdateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify invoice exists and is draft
  const { data: existing, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft invoices can be edited" },
      { status: 409 }
    );
  }

  const d = parsed.data;
  const discount = d.discount ?? 0;

  // Delete existing items
  const { error: deleteError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Insert new items
  const itemRows = d.items.map((item) => ({
    invoice_id: id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
    sort_order: item.sort_order,
  }));

  const { error: insertError } = await supabase
    .from("invoice_items")
    .insert(itemRows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Recalculate totals
  const subtotal = itemRows.reduce((sum, li) => sum + li.total, 0);
  const total = subtotal - discount;

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update({
      subtotal,
      discount,
      total,
      notes: d.notes ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.updated",
    targetTable: "invoices",
    targetId: id,
    metadata: { item_count: d.items.length, subtotal, discount, total },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { ...updated, items: itemRows },
  });
}
