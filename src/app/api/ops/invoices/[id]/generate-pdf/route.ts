import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  PLANT_INVOICE_FOOTER_NOTE_KEY,
  DEFAULT_PLANT_INVOICE_FOOTER_NOTE,
} from "@/lib/billing/plant-invoice-template";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

type ItemRow = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  section: "service" | "plants";
  sort_order: number;
};

// ---------------------------------------------------------------------------
// POST /api/ops/invoices/[id]/generate-pdf — sectioned A/B invoice PDF. PRD §8.
// Admin only. Allowed for finalized/paid. Sets pdf_generated_at.
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

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

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

  const { data: itemsData, error: itemsError } = await supabase
    .from("invoice_items")
    .select("description, quantity, unit_price, total, section, sort_order")
    .eq("invoice_id", id)
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Configurable explanatory footer note (global default; editable in template editor).
  const { data: footerCfg } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", PLANT_INVOICE_FOOTER_NOTE_KEY)
    .maybeSingle();
  const footerNote = (footerCfg?.value ?? DEFAULT_PLANT_INVOICE_FOOTER_NOTE).trim();

  const allItems = (itemsData ?? []) as ItemRow[];
  const serviceItems = allItems.filter((i) => i.section === "service");
  const plantItems = allItems.filter((i) => i.section === "plants");
  const serviceSubtotal = serviceItems.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const plantSubtotal = plantItems.reduce((s, i) => s + Number(i.total ?? 0), 0);

  const customer = invoice.customers as unknown as {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    societies: { name: string } | null;
  } | null;

  // ── PDF setup ──────────────────────────────────────────────────────────────
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

  // The built-in Helvetica font has no ₹ glyph; the reference invoice uses plain
  // numbers in the table, so render amounts without a currency symbol.
  const inr = (n: number) => Number(n).toLocaleString("en-IN");

  // Column geometry (usable width 50..545 = 495)
  const colNo = 50; // S.No
  const colDesc = 80; // Description
  const colQty = 305; // Quantity (right)
  const colPrice = 365; // Price per unit (right)
  const colTotal = 455; // Total Cost (right)
  const wNo = 26;
  const wDesc = 220;
  const wQty = 55;
  const wPrice = 85;
  const wTotal = 90;
  const rightEdge = 545;

  // ── Header ───────────────────────────────────────────────────────────────
  const logoPath = path.join(
    process.cwd(),
    "public/images/nuvvy_logo_transparent_small.png"
  );
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { width: 80 });
  }

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Nuvvy Garden Care", 350, 45, { align: "right" })
    .text("Whitefield, Bangalore", { align: "right" })
    .text("www.nuvvy.in", { align: "right" });

  const dividerY = 100;
  doc
    .moveTo(50, dividerY)
    .lineTo(rightEdge, dividerY)
    .strokeColor(stone)
    .lineWidth(1)
    .stroke();

  // Title
  const title = customer?.name ? `${customer.name} — Invoice for Plants` : "INVOICE";
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(forest)
    .text(title, 50, dividerY + 15, { width: 360 });

  // Meta block (right)
  const metaY = dividerY + 15;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Invoice Number", 360, metaY, { width: 185, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(charcoal)
    .text(invoice.invoice_number, 360, metaY + 12, { width: 185, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(sage)
    .text("Date", 360, metaY + 30, { width: 185, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(charcoal)
    .text(
      formatDatePdf(invoice.invoice_date ?? invoice.finalized_at ?? invoice.created_at),
      360,
      metaY + 42,
      { width: 185, align: "right" }
    );

  // Bill To
  const billToY = dividerY + 55;
  doc.font("Helvetica").fontSize(9).fillColor(sage).text("BILL TO", 50, billToY);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(charcoal)
    .text(customer?.name ?? "Customer", 50, billToY + 14, { width: 290 });
  let billCursor = billToY + 28;
  if (customer?.societies?.name) {
    doc.font("Helvetica").fontSize(9).fillColor(charcoal).text(customer.societies.name, 50, billCursor, { width: 290 });
    billCursor += 12;
  }
  if (customer?.address) {
    doc.font("Helvetica").fontSize(9).fillColor(charcoal).text(customer.address, 50, billCursor, { width: 290 });
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  let rowY = billToY + 80;

  function drawColumnHeader(y: number): number {
    doc.rect(48, y - 5, 499, 22).fillColor(cream).fill();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(forest);
    doc.text("S.No", colNo, y, { width: wNo });
    doc.text("Description", colDesc, y, { width: wDesc });
    doc.text("Quantity", colQty, y, { width: wQty, align: "right" });
    doc.text("Price per unit", colPrice, y, { width: wPrice, align: "right" });
    // Widen the box leftward so "(Rupees)" fits without wrapping.
    doc.text("Total Cost (Rupees)", colTotal - 20, y, { width: wTotal + 20, align: "right" });
    return y + 25;
  }

  function ensureSpace(needed: number) {
    if (rowY + needed > 760) {
      doc.addPage();
      rowY = 50;
      rowY = drawColumnHeader(rowY);
    }
  }

  function drawSectionHeader(label: string) {
    ensureSpace(40);
    doc.rect(48, rowY - 5, 499, 20).fillColor("#EAF1EB").fill();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(forest).text(label, colNo, rowY, { width: 400 });
    rowY += 22;
  }

  function drawLine(n: number, item: ItemRow) {
    ensureSpace(24);
    const priceBlank = item.unit_price === null || item.unit_price === undefined;
    const isService = item.section === "service";
    // Service lines: only a Total Cost per line — no quantity / price-per-unit.
    const qtyStr = isService
      ? ""
      : item.quantity === null || item.quantity === undefined
      ? "-"
      : String(item.quantity);
    const priceStr = isService ? "" : priceBlank ? "-" : inr(item.unit_price as number);
    const totalStr = priceBlank ? "-" : inr(Number(item.total ?? 0));

    doc.font("Helvetica").fontSize(9.5).fillColor(charcoal);
    doc.text(String(n), colNo, rowY, { width: wNo });
    doc.text(item.description, colDesc, rowY, { width: wDesc });
    doc.text(qtyStr, colQty, rowY, { width: wQty, align: "right" });
    doc.text(priceStr, colPrice, rowY, { width: wPrice, align: "right" });
    doc.text(totalStr, colTotal, rowY, { width: wTotal, align: "right" });

    // advance by the tallest cell (description may wrap)
    const descHeight = doc.heightOfString(item.description, { width: wDesc });
    rowY += Math.max(descHeight, 12) + 8;

    doc.moveTo(50, rowY - 5).lineTo(rightEdge, rowY - 5).strokeColor(stone).lineWidth(0.4).stroke();
  }

  function drawSubtotalRow(label: string, amount: number) {
    ensureSpace(22);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(charcoal);
    doc.text(label, colDesc, rowY, { width: colTotal - colDesc - 6, align: "right" });
    doc.text(inr(amount), colTotal, rowY, { width: wTotal, align: "right" });
    rowY += 20;
  }

  rowY = drawColumnHeader(rowY);

  // Section A — Service & Materials
  drawSectionHeader("Service and Materials");
  if (serviceItems.length === 0) {
    ensureSpace(20);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(sage).text("—", colNo, rowY);
    rowY += 18;
  } else {
    serviceItems.forEach((item, i) => drawLine(i + 1, item));
  }
  drawSubtotalRow("Service & Materials Total", serviceSubtotal);

  // Section B — Plants
  rowY += 6;
  drawSectionHeader("Plants");
  if (plantItems.length === 0) {
    ensureSpace(20);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(sage).text("—", colNo, rowY);
    rowY += 18;
  } else {
    plantItems.forEach((item, i) => drawLine(i + 1, item));
  }
  drawSubtotalRow("Plants Total", plantSubtotal);

  // ── Grand total ──────────────────────────────────────────────────────────
  rowY += 6;
  ensureSpace(60);
  doc.moveTo(colDesc, rowY - 2).lineTo(rightEdge, rowY - 2).strokeColor(forest).lineWidth(1).stroke();
  rowY += 6;

  if (Number(invoice.discount) > 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor(forest);
    doc.text("Discount", colDesc, rowY, { width: colTotal - colDesc - 6, align: "right" });
    doc.text(`-${inr(Number(invoice.discount))}`, colTotal, rowY, { width: wTotal, align: "right" });
    rowY += 18;
  }

  doc.font("Helvetica-Bold").fontSize(13).fillColor(forest);
  doc.text("Total cost", colDesc, rowY, { width: colTotal - colDesc - 6, align: "right" });
  doc.text(inr(Number(invoice.total)), colTotal, rowY, { width: wTotal, align: "right" });
  rowY += 24;

  // PAID stamp
  if (invoice.status === "paid") {
    doc
      .save()
      .rotate(-20, { origin: [350, rowY + 30] })
      .font("Helvetica-Bold")
      .fontSize(40)
      .fillColor(forest)
      .opacity(0.15)
      .text("PAID", 290, rowY + 10)
      .restore();
    doc.opacity(1);
  }

  // Per-invoice notes (optional)
  if (invoice.notes) {
    const h = doc.heightOfString(invoice.notes, { width: 495 });
    ensureSpace(h + 24);
    rowY += 12;
    doc.font("Helvetica").fontSize(9).fillColor(sage).text("Notes:", 50, rowY);
    doc.font("Helvetica").fontSize(9).fillColor(charcoal).text(invoice.notes, 50, rowY + 14, { width: 495 });
    rowY += 14 + h;
  }

  // Configurable explanatory footer note (e.g. installation-charges paragraph)
  if (footerNote) {
    const h = doc.heightOfString(footerNote, { width: 495 });
    ensureSpace(h + 20);
    rowY += 14;
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(charcoal).text(footerNote, 50, rowY, { width: 495 });
    rowY += h;
  }

  // Brand footer pinned near the bottom of the last page
  const footerY = 780;
  doc.moveTo(50, footerY).lineTo(rightEdge, footerY).strokeColor(stone).lineWidth(0.5).stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(sage)
    .text("Thank you for ordering from Nuvvy.", 50, footerY + 8, { align: "center", width: 495 })
    .text("www.nuvvy.in  •  Whitefield, Bangalore", { align: "center", width: 495 });

  doc.end();
  const pdfArrayBuffer = await pdfReady;

  // Record the download.
  await supabase
    .from("invoices")
    .update({ pdf_generated_at: new Date().toISOString() })
    .eq("id", id);

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.pdf_generated",
    targetTable: "invoices",
    targetId: id,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

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
