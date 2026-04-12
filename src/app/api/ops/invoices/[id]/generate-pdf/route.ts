import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// POST /api/ops/invoices/[id]/generate-pdf — generate branded PDF invoice
// ---------------------------------------------------------------------------
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
  const supabase = getSupabaseAdmin();

  // Fetch invoice with customer info
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*, customers(id, name, phone_number, address, societies(name))")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!["finalized", "paid"].includes(invoice.status)) {
    return NextResponse.json(
      { error: "Only finalized or paid invoices can generate a PDF" },
      { status: 409 }
    );
  }

  // Fetch line items
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const customer = invoice.customers as unknown as {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    societies: { name: string } | null;
  } | null;

  // Build PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (PDFDocument as any)({ size: "A4", margin: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: any[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.on("data", (chunk: any) => chunks.push(chunk));

  const pdfReady = new Promise<ArrayBuffer>((resolve) => {
    doc.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    });
  });

  // Brand colors
  const forest = "#2D5A3D";
  const charcoal = "#1E2822";
  const sage = "#8BAF8A";
  const cream = "#F0E8D8";
  const stone = "#D8CCBA";

  // Logo
  const logoPath = path.join(process.cwd(), "public/images/nuvvy_logo_transparent_small.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { width: 80 });
  }

  // Company info (right aligned)
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Nuvvy Garden Care", 350, 45, { align: "right" })
    .text("Whitefield, Bangalore", { align: "right" })
    .text("hello@nuvvy.in", { align: "right" })
    .text("nuvvy.in", { align: "right" });

  // Divider
  const dividerY = 100;
  doc
    .moveTo(50, dividerY)
    .lineTo(545, dividerY)
    .strokeColor(stone)
    .lineWidth(1)
    .stroke();

  // INVOICE title
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(forest)
    .text("INVOICE", 50, dividerY + 15);

  // Invoice details (right)
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(charcoal);

  const detailsY = dividerY + 15;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Invoice Number", 350, detailsY, { align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(charcoal)
    .text(invoice.invoice_number, 350, detailsY + 12, { align: "right" });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Date", 350, detailsY + 30, { align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(charcoal)
    .text(formatDatePdf(invoice.finalized_at ?? invoice.created_at), 350, detailsY + 42, { align: "right" });

  if (invoice.status === "paid" && invoice.paid_at) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(sage)
      .text("Paid On", 350, detailsY + 60, { align: "right" });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(forest)
      .text(formatDatePdf(invoice.paid_at), 350, detailsY + 72, { align: "right" });
  }

  // Bill To
  const billToY = dividerY + 55;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("BILL TO", 50, billToY);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(charcoal)
    .text(customer?.name ?? "Customer", 50, billToY + 14);

  if (customer?.societies?.name) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(charcoal)
      .text(customer.societies.name, 50, billToY + 28);
  }
  if (customer?.address) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(charcoal)
      .text(customer.address, 50, billToY + (customer?.societies?.name ? 40 : 28), { width: 250 });
  }

  // Table
  const tableTop = billToY + 75;
  const colDesc = 50;
  const colQty = 340;
  const colPrice = 400;
  const colTotal = 480;

  // Table header background
  doc
    .rect(48, tableTop - 5, 499, 22)
    .fillColor(cream)
    .fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(forest);

  doc.text("Description", colDesc, tableTop, { width: 280 });
  doc.text("Qty", colQty, tableTop, { width: 50, align: "right" });
  doc.text("Price", colPrice, tableTop, { width: 70, align: "right" });
  doc.text("Total", colTotal, tableTop, { width: 65, align: "right" });

  // Table rows
  let rowY = tableTop + 25;
  doc.font("Helvetica").fontSize(10).fillColor(charcoal);

  for (const item of items ?? []) {
    doc.text(item.description, colDesc, rowY, { width: 280 });
    doc.text(String(item.quantity), colQty, rowY, { width: 50, align: "right" });
    doc.text(`₹${Number(item.unit_price).toLocaleString("en-IN")}`, colPrice, rowY, { width: 70, align: "right" });
    doc.text(`₹${Number(item.total).toLocaleString("en-IN")}`, colTotal, rowY, { width: 65, align: "right" });

    rowY += 22;

    // Row divider
    doc
      .moveTo(50, rowY - 5)
      .lineTo(545, rowY - 5)
      .strokeColor(stone)
      .lineWidth(0.5)
      .stroke();
  }

  // Totals section
  const totalsY = rowY + 10;

  doc.font("Helvetica").fontSize(10).fillColor(sage);
  doc.text("Subtotal", colPrice - 60, totalsY, { width: 130, align: "right" });
  doc.fillColor(charcoal);
  doc.text(`₹${Number(invoice.subtotal).toLocaleString("en-IN")}`, colTotal, totalsY, { width: 65, align: "right" });

  if (invoice.discount > 0) {
    doc.fillColor(forest);
    doc.text("Discount", colPrice - 60, totalsY + 18, { width: 130, align: "right" });
    doc.text(`-₹${Number(invoice.discount).toLocaleString("en-IN")}`, colTotal, totalsY + 18, { width: 65, align: "right" });
  }

  const totalRowY = totalsY + (invoice.discount > 0 ? 40 : 22);

  // Total divider
  doc
    .moveTo(colPrice - 60, totalRowY - 5)
    .lineTo(545, totalRowY - 5)
    .strokeColor(forest)
    .lineWidth(1)
    .stroke();

  doc.font("Helvetica-Bold").fontSize(13).fillColor(forest);
  doc.text("Total", colPrice - 60, totalRowY, { width: 130, align: "right" });
  doc.text(`₹${Number(invoice.total).toLocaleString("en-IN")}`, colTotal, totalRowY, { width: 65, align: "right" });

  // Paid stamp
  if (invoice.status === "paid") {
    doc
      .save()
      .rotate(-20, { origin: [350, totalRowY + 50] })
      .font("Helvetica-Bold")
      .fontSize(36)
      .fillColor(forest)
      .opacity(0.15)
      .text("PAID", 300, totalRowY + 35)
      .restore();
  }

  // Notes
  if (invoice.notes) {
    const notesY = totalRowY + 45;
    doc.font("Helvetica").fontSize(9).fillColor(sage).text("Notes:", 50, notesY);
    doc.font("Helvetica").fontSize(9).fillColor(charcoal).text(invoice.notes, 50, notesY + 14, { width: 400 });
  }

  // Footer
  const footerY = 760;
  doc
    .moveTo(50, footerY)
    .lineTo(545, footerY)
    .strokeColor(stone)
    .lineWidth(0.5)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(sage)
    .text("Thank you for choosing Nuvvy for your garden care needs.", 50, footerY + 8, {
      align: "center",
      width: 495,
    })
    .text("nuvvy.in • hello@nuvvy.in • Whitefield, Bangalore", {
      align: "center",
      width: 495,
    });

  doc.end();

  const pdfArrayBuffer = await pdfReady;

  return new Response(pdfArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      "Content-Length": String(pdfArrayBuffer.byteLength),
    },
  });
}

function formatDatePdf(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
