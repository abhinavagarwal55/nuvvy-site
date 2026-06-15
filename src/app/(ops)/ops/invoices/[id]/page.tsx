"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Download,
  Send,
  Check,
  Undo2,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import PlantSelector from "@/components/ops/PlantSelector";
import {
  renderPlantInvoiceTemplate,
  DEFAULT_PLANT_INVOICE_TEMPLATE,
} from "@/lib/billing/plant-invoice-template";
import { DEFAULT_NUVVY_UPI_ID } from "@/lib/billing/template";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  draft: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Draft" },
  finalized: { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Invoice Finalized" },
  paid: { cls: "bg-forest/10 text-forest border-forest/30", label: "Paid" },
  cancelled: { cls: "bg-stone/20 text-sage border-stone", label: "Cancelled" },
};

type ApiLine = {
  id?: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  section: "service" | "plants";
  plant_order_item_id: string | null;
  sort_order: number;
};

type Customer = {
  id: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  societies: { name: string } | null;
};

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  customer_id: string;
  plant_order_id: string | null;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  invoice_date: string | null;
  paid_at: string | null;
  finalized_at: string | null;
  whatsapp_sent_at: string | null;
  created_at: string;
  customer: Customer | null;
  sections: { service: ApiLine[]; plants: ApiLine[] };
};

type EditLine = {
  key: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  plant_order_item_id: string | null;
};

let keyCounter = 0;
const nextKey = () => `l${keyCounter++}`;

function parseMoney(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function parseQty(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toEditLine(l: ApiLine): EditLine {
  return {
    key: nextKey(),
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    plant_order_item_id: l.plant_order_item_id,
  };
}

export default function InvoiceEditorPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editable state
  const [serviceLines, setServiceLines] = useState<EditLine[]>([]);
  const [plantLines, setPlantLines] = useState<EditLine[]>([]);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [discount, setDiscount] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // WhatsApp template (for the message text)
  const [waTemplate, setWaTemplate] = useState(DEFAULT_PLANT_INVOICE_TEMPLATE);

  const hydrate = useCallback((inv: InvoiceDetail) => {
    setServiceLines(inv.sections.service.map(toEditLine));
    setPlantLines(inv.sections.plants.map(toEditLine));
    setInvoiceDate(inv.invoice_date ?? "");
    setDiscount(inv.discount ? Number(inv.discount) : null);
    setNotes(inv.notes ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/invoices/${invoiceId}`);
    if (res.ok) {
      const json = await res.json();
      const inv: InvoiceDetail = json.data;
      setInvoice(inv);
      hydrate(inv);
    }
    setLoading(false);
  }, [invoiceId, hydrate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/ops/system-config/plant-invoice-template")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.template) setWaTemplate(d.data.template);
      })
      .catch(() => {});
  }, []);

  // ── Derived totals (live) ──────────────────────────────────────────────────
  const serviceSubtotal = useMemo(
    () => serviceLines.reduce((s, l) => s + (l.unit_price ?? 0), 0),
    [serviceLines]
  );
  const plantSubtotal = useMemo(
    () => plantLines.reduce((s, l) => s + (l.quantity ?? 1) * (l.unit_price ?? 0), 0),
    [plantLines]
  );
  const subtotal = serviceSubtotal + plantSubtotal;
  const grandTotal = Math.max(0, subtotal - (discount ?? 0));

  const status = invoice?.status ?? "draft";
  const isPaid = status === "paid";
  const isCancelled = status === "cancelled";
  const isEditable = status === "draft" || status === "finalized";
  const hasBeenSaved = status === "finalized" || status === "paid";

  // ── Mutations on local lines ───────────────────────────────────────────────
  function updateService(key: string, patch: Partial<EditLine>) {
    setServiceLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function updatePlant(key: string, patch: Partial<EditLine>) {
    setPlantLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addServiceLine() {
    setServiceLines((p) => [
      ...p,
      { key: nextKey(), description: "", quantity: null, unit_price: null, plant_order_item_id: null },
    ]);
  }
  function addPlantLine(description: string) {
    setPlantLines((p) => [
      ...p,
      { key: nextKey(), description, quantity: 1, unit_price: null, plant_order_item_id: null },
    ]);
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    setAction("save");
    try {
      const res = await fetch(`/api/ops/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_date: invoiceDate || undefined,
          discount: discount ?? 0,
          notes: notes || undefined,
          sections: {
            service: serviceLines
              .filter((l) => l.description.trim())
              .map((l, i) => ({
                description: l.description.trim(),
                quantity: null,
                unit_price: l.unit_price,
                sort_order: i + 1,
              })),
            plants: plantLines
              .filter((l) => l.description.trim())
              .map((l, i) => ({
                description: l.description.trim(),
                quantity: l.quantity,
                unit_price: l.unit_price,
                plant_order_item_id: l.plant_order_item_id,
                sort_order: i + 1,
              })),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : "Could not save — check the line items and discount.";
        setError(msg);
        return;
      }
      await load();
      setNotice(
        grandTotal === 0
          ? "Saved. Heads up: the grand total is ₹0 — add unit prices before sending."
          : "Invoice saved and finalized."
      );
    } catch {
      setError("Network error while saving.");
    } finally {
      setAction(null);
    }
  }

  async function downloadPdf(): Promise<boolean> {
    const res = await fetch(`/api/ops/invoices/${invoiceId}/generate-pdf`, { method: "POST" });
    if (res.ok && res.headers.get("content-type")?.includes("application/pdf")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.invoice_number ?? "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }
    const json = await res.json().catch(() => ({}));
    setError(typeof json.error === "string" ? json.error : "Failed to generate PDF");
    return false;
  }

  async function handleDownloadPdf() {
    setError(null);
    setNotice(null);
    setAction("pdf");
    await downloadPdf();
    setAction(null);
  }

  async function handleSendWa() {
    if (!invoice?.customer?.phone_number) return;
    setError(null);
    setNotice(null);
    setAction("wa");
    try {
      const ok = await downloadPdf();
      if (!ok) return;
      const message = renderPlantInvoiceTemplate(waTemplate, {
        customer_name: invoice.customer.name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date ? formatDate(invoice.invoice_date) : "",
        total: invoice.total,
        upi_id: DEFAULT_NUVVY_UPI_ID,
      });
      const digits = invoice.customer.phone_number.replace(/\D/g, "");
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      await fetch(`/api/ops/invoices/${invoiceId}/whatsapp-sent`, { method: "POST" });
      await load();
      setNotice("PDF downloaded — attach it in WhatsApp before sending.");
    } catch {
      setError("Network error while sending.");
    } finally {
      setAction(null);
    }
  }

  async function handleRevert() {
    setError(null);
    setNotice(null);
    setAction("revert");
    try {
      const res = await fetch(`/api/ops/invoices/${invoiceId}/revert`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(typeof json.error === "string" ? json.error : "Failed to revert");
      } else {
        await load();
        setNotice("Reverted to Finalized — you can edit now.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-forest" />
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-terra">Invoice not found</p>
      </div>
    );
  }

  const badge = STATUS_BADGE[status] ?? { cls: "bg-stone/20 text-charcoal border-stone", label: status };
  const phone = invoice.customer?.phone_number;
  const canSendWa = !!phone && hasBeenSaved;

  return (
    <div className="min-h-screen bg-cream pb-28">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl text-charcoal truncate"
              style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
            >
              {invoice.invoice_number}
            </h1>
            <p className="text-xs text-sage truncate">
              {invoice.customer?.name ?? "Unknown"}
              {invoice.customer?.societies?.name && ` · ${invoice.customer.societies.name}`}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex-shrink-0 ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[760px] mx-auto">
        {/* Meta card */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-sage">Customer</span>
            <span className="text-charcoal font-medium text-right">{invoice.customer?.name}</span>
          </div>
          {invoice.customer?.address && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Address</span>
              <span className="text-charcoal text-right max-w-[60%]">{invoice.customer.address}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-sage">Invoice date</span>
            <input
              type="date"
              value={invoiceDate}
              disabled={!isEditable}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest disabled:opacity-60"
            />
          </div>
          {invoice.plant_order_id && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Plant order</span>
              <button
                onClick={() => router.push(`/ops/plant-orders/${invoice.plant_order_id}`)}
                className="text-forest hover:text-garden font-medium underline"
              >
                View order
              </button>
            </div>
          )}
        </div>

        {/* Locked notice for paid */}
        {isPaid && (
          <div className="bg-forest/5 border border-forest/30 rounded-2xl p-4 flex items-start gap-3">
            <p className="text-sm text-charcoal flex-1">
              This invoice is <strong>paid</strong> and locked. Revert to Finalized to make changes.
            </p>
            <button
              onClick={handleRevert}
              disabled={action === "revert"}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-forest text-forest rounded-xl text-xs font-medium hover:bg-forest/5 disabled:opacity-50"
            >
              <Undo2 size={14} /> {action === "revert" ? "Reverting…" : "Revert to Finalized"}
            </button>
          </div>
        )}

        {/* Section A — Service & Materials */}
        <SectionCard
          title="Section A — Service & Materials"
          subtotal={serviceSubtotal}
          subtotalLabel="Service & Materials Total"
        >
          {serviceLines.map((l) => (
            <div key={l.key} className="bg-cream rounded-xl p-3 border border-stone/30 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  className={INPUT_CLS}
                  value={l.description}
                  disabled={!isEditable}
                  onChange={(e) => updateService(l.key, { description: e.target.value })}
                  placeholder="Service description"
                />
                {isEditable && (
                  <button
                    onClick={() => setServiceLines((p) => p.filter((x) => x.key !== l.key))}
                    className="text-terra hover:text-terra/80 p-2.5"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="w-44">
                <label className="block text-[10px] text-sage mb-0.5">Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  className={INPUT_CLS}
                  value={l.unit_price ?? ""}
                  disabled={!isEditable}
                  onChange={(e) => updateService(l.key, { unit_price: parseMoney(e.target.value) })}
                  placeholder="—"
                />
              </div>
            </div>
          ))}
          {isEditable && (
            <button
              onClick={addServiceLine}
              className="flex items-center gap-1 text-sm text-forest hover:text-garden font-medium"
            >
              <Plus size={14} /> Add service line
            </button>
          )}
        </SectionCard>

        {/* Section B — Plants */}
        <SectionCard
          title="Section B — Plants"
          subtotal={plantSubtotal}
          subtotalLabel="Plants Total"
        >
          {plantLines.map((l) => (
            <div key={l.key} className="bg-cream rounded-xl p-3 border border-stone/30 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  className={INPUT_CLS}
                  value={l.description}
                  disabled={!isEditable}
                  onChange={(e) => updatePlant(l.key, { description: e.target.value })}
                  placeholder="Plant name"
                />
                {isEditable && (
                  <button
                    onClick={() => setPlantLines((p) => p.filter((x) => x.key !== l.key))}
                    className="text-terra hover:text-terra/80 p-2.5"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-sage mb-0.5">Qty</label>
                  <input
                    type="number"
                    min={0}
                    className={`${INPUT_CLS} text-center`}
                    value={l.quantity ?? ""}
                    disabled={!isEditable}
                    onChange={(e) => updatePlant(l.key, { quantity: parseQty(e.target.value) })}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-sage mb-0.5">Price/unit (₹)</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className={INPUT_CLS}
                    value={l.unit_price ?? ""}
                    disabled={!isEditable}
                    onChange={(e) => updatePlant(l.key, { unit_price: parseMoney(e.target.value) })}
                    placeholder="—"
                  />
                </div>
                <div className="text-right">
                  <label className="block text-[10px] text-sage mb-0.5">Total</label>
                  <p className="text-sm font-medium text-charcoal py-2.5">
                    ₹{((l.quantity ?? 1) * (l.unit_price ?? 0)).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {isEditable && (
            <div className="border-t border-stone/30 pt-3 space-y-2">
              <label className="block text-[10px] text-sage uppercase tracking-wider">
                Add a plant (search the catalog, or type a custom name)
              </label>
              <PlantSelector
                value={null}
                onChange={(plant) => {
                  if (plant?.plant_name) addPlantLine(plant.plant_name);
                }}
              />
            </div>
          )}
        </SectionCard>

        {/* Discount + Notes */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-4">
          <div>
            <label className="block text-xs text-sage mb-1">Discount (₹)</label>
            <input
              type="number"
              min={0}
              className={`${INPUT_CLS} w-40`}
              value={discount ?? ""}
              disabled={!isEditable}
              onChange={(e) => setDiscount(parseMoney(e.target.value))}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Notes</label>
            <textarea
              className={`${INPUT_CLS} min-h-[60px]`}
              value={notes}
              disabled={!isEditable}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, installation note…"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-sage">Subtotal</span>
            <span className="text-charcoal">₹{subtotal.toLocaleString("en-IN")}</span>
          </div>
          {(discount ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-forest">Discount</span>
              <span className="text-forest">-₹{(discount ?? 0).toLocaleString("en-IN")}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-1 border-t border-stone/40 mt-1">
            <span className="text-charcoal">Grand total</span>
            <span className="text-charcoal">₹{grandTotal.toLocaleString("en-IN")}</span>
          </div>
          {isEditable && grandTotal === 0 && (
            <p className="text-xs text-terra pt-1">Grand total is ₹0 — add unit prices before sending.</p>
          )}
        </div>

        {/* Messages */}
        {error && <p className="text-sm text-terra">{error}</p>}
        {notice && <p className="text-sm text-forest">{notice}</p>}

        {/* Actions */}
        <div className="space-y-2 mb-16">
          {isEditable && (
            <button
              onClick={handleSave}
              disabled={action === "save"}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {action === "save" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {action === "save" ? "Saving…" : "Save"}
            </button>
          )}

          {hasBeenSaved && (
            <>
              <button
                onClick={handleDownloadPdf}
                disabled={action === "pdf"}
                className="w-full py-2.5 border border-forest text-forest rounded-xl text-sm font-medium hover:bg-forest/5 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {action === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {action === "pdf" ? "Generating…" : "Download PDF"}
              </button>
              <button
                onClick={handleSendWa}
                disabled={!canSendWa || action === "wa"}
                title={!phone ? "No phone on file." : undefined}
                className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                  canSendWa
                    ? "bg-forest text-offwhite hover:bg-garden"
                    : "border border-stone text-stone cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {action === "wa" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {action === "wa" ? "Preparing…" : "Send WhatsApp"}
              </button>
              {invoice.whatsapp_sent_at && (
                <p className="text-[11px] text-sage text-center">
                  Last sent {formatDate(invoice.whatsapp_sent_at.slice(0, 10))}
                </p>
              )}
              <p className="text-[11px] text-sage text-center">
                PDF downloads to your device — attach it manually in WhatsApp.
              </p>
            </>
          )}

          {isCancelled && (
            <p className="text-sm text-sage text-center">This invoice is cancelled.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtotal,
  subtotalLabel,
  children,
}: {
  title: string;
  subtotal: number;
  subtotalLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
      <h2
        className="text-base text-charcoal mb-3"
        style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
      >
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
      <div className="flex justify-between text-sm font-medium pt-3 mt-3 border-t border-stone/40">
        <span className="text-sage">{subtotalLabel}</span>
        <span className="text-charcoal">₹{subtotal.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}
