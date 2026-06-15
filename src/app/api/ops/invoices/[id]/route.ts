import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

type InvoiceItemRow = {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  section: "service" | "plants";
  plant_order_item_id: string | null;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// GET /api/ops/invoices/[id] — invoice detail with items grouped by section.
// Read — admin or horticulturist.
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
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const cust = invoice.customers as unknown as {
    id: string; name: string; phone_number: string | null;
    address: string | null; societies: { name: string } | null;
  } | null;
  const { customers: _c, ...invoiceRest } = invoice;
  void _c;

  const allItems = (items ?? []) as InvoiceItemRow[];
  const sections = {
    service: allItems.filter((i) => i.section === "service"),
    plants: allItems.filter((i) => i.section === "plants"),
  };

  return NextResponse.json({
    data: {
      ...invoiceRest,
      customer: cust,
      items: allItems,
      sections,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/ops/invoices/[id] — Save the sectioned invoice. PRD §6.3.
// Admin only. Allowed in draft AND finalized; rejected for paid/cancelled.
// Save sets status='finalized' (first save) and recomputes all money.
// ---------------------------------------------------------------------------
const LineSchema = z.object({
  description: z.string(),
  quantity: z.number().int().min(0).nullable(),
  unit_price: z.number().min(0).nullable(),
  sort_order: z.number().int().min(0),
  plant_order_item_id: z.string().uuid().nullable().optional(),
});

const UpdateInvoiceSchema = z.object({
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "invoice_date must be YYYY-MM-DD")
    .optional(),
  sections: z.object({
    service: z.array(LineSchema),
    plants: z.array(LineSchema),
  }),
  discount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

type ValidLine = z.infer<typeof LineSchema>;

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

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
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

  const { data: existing, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status, finalized_at, subtotal, total")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing.status === "paid") {
    return NextResponse.json(
      { error: "Paid invoices are locked. Revert to Finalized to edit." },
      { status: 409 }
    );
  }
  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Cancelled invoices cannot be edited." },
      { status: 409 }
    );
  }

  const d = parsed.data;

  // Drop blank-description rows; compute line totals server-side (PRD §3.2).
  const lineTotal = (line: ValidLine, section: "service" | "plants"): number => {
    const price = line.unit_price ?? 0;
    if (section === "service") return price;
    return (line.quantity ?? 1) * price;
  };

  const buildRows = (lines: ValidLine[], section: "service" | "plants") =>
    lines
      .filter((l) => l.description.trim().length > 0)
      .map((l, idx) => ({
        invoice_id: id,
        description: l.description.trim(),
        quantity: section === "service" ? null : l.quantity,
        unit_price: l.unit_price,
        total: lineTotal(l, section),
        section,
        plant_order_item_id: l.plant_order_item_id ?? null,
        sort_order: idx + 1,
      }));

  const serviceRows = buildRows(d.sections.service, "service");
  const plantRows = buildRows(d.sections.plants, "plants");
  const itemRows = [...serviceRows, ...plantRows];

  const serviceSubtotal = serviceRows.reduce((s, r) => s + r.total, 0);
  const plantSubtotal = plantRows.reduce((s, r) => s + r.total, 0);
  const subtotal = serviceSubtotal + plantSubtotal;
  const discount = d.discount ?? 0;

  if (discount > subtotal) {
    return NextResponse.json(
      { error: "Discount cannot exceed the subtotal." },
      { status: 400 }
    );
  }

  const total = subtotal - discount;

  // Replace items.
  const { error: deleteError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (itemRows.length > 0) {
    const { error: insertError } = await supabase
      .from("invoice_items")
      .insert(itemRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const update: Record<string, unknown> = {
    subtotal,
    discount,
    total,
    notes: d.notes ?? null,
    status: "finalized",
    finalized_at: existing.finalized_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (d.invoice_date) update.invoice_date = d.invoice_date;

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.saved",
    targetTable: "invoices",
    targetId: id,
    metadata: {
      before: { status: existing.status, subtotal: existing.subtotal, total: existing.total },
      after: { status: "finalized", subtotal, total, discount },
      service_subtotal: serviceSubtotal,
      plant_subtotal: plantSubtotal,
      line_count: itemRows.length,
    },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: {
      ...updated,
      items: itemRows,
      sections: { service: serviceRows, plants: plantRows },
    },
  });
}
