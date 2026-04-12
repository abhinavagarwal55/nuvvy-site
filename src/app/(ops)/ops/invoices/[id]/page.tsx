"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  FileText,
  CreditCard,
  Send,
  Download,
  Pencil,
  Check,
  Copy,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  draft: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Draft" },
  finalized: { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Finalized" },
  paid: { cls: "bg-forest/10 text-forest border-forest/30", label: "Paid" },
};

type InvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
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
  paid_at: string | null;
  finalized_at: string | null;
  created_at: string;
  customer: Customer | null;
  items: InvoiceItem[];
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/invoices/${invoiceId}`);
    if (res.ok) {
      const json = await res.json();
      setInvoice(json.data ?? null);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing() {
    if (!invoice) return;
    setEditItems(
      invoice.items.map((li, i) => ({
        ...li,
        sort_order: li.sort_order ?? i + 1,
      }))
    );
    setEditDiscount(invoice.discount ?? 0);
    setEditNotes(invoice.notes ?? "");
    setEditing(true);
  }

  function addLineItem() {
    setEditItems((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
        sort_order: prev.length + 1,
      },
    ]);
  }

  function updateLineItem(index: number, updates: Partial<InvoiceItem>) {
    setEditItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        updated.total = updated.quantity * updated.unit_price;
        return updated;
      })
    );
  }

  function removeLineItem(index: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const validItems = editItems.filter((li) => li.description.trim());
    if (validItems.length === 0) return;

    setSaving(true);
    const res = await fetch(`/api/ops/invoices/${invoiceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: validItems.map((li, i) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          sort_order: i + 1,
        })),
        discount: editDiscount,
        notes: editNotes || undefined,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to save");
    } else {
      setEditing(false);
      await load();
    }
    setSaving(false);
  }

  async function handleFinalize() {
    setActionLoading("finalize");
    const res = await fetch(`/api/ops/invoices/${invoiceId}/finalize`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to finalize");
    } else {
      await load();
    }
    setActionLoading(null);
  }

  async function handleMarkPaid() {
    setActionLoading("paid");
    const res = await fetch(`/api/ops/invoices/${invoiceId}/mark-paid`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to mark paid");
    } else {
      await load();
    }
    setActionLoading(null);
  }

  async function handleReopenDraft() {
    setActionLoading("reopen");
    const res = await fetch(`/api/ops/invoices/${invoiceId}/edit-regenerate`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to reopen");
    } else {
      await load();
    }
    setActionLoading(null);
  }

  async function handleDownloadPdf() {
    setActionLoading("pdf");
    const res = await fetch(`/api/ops/invoices/${invoiceId}/generate-pdf`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Failed to generate PDF");
      setActionLoading(null);
      return;
    }

    // If the API returns a PDF blob
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/pdf")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.invoice_number ?? "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("PDF generation is being set up. Please try again shortly.");
    }
    setActionLoading(null);
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

  const badge = STATUS_BADGE[invoice.status] ?? {
    cls: "bg-stone/20 text-charcoal border-stone",
    label: invoice.status,
  };

  const editSubtotal = editItems.reduce(
    (sum, li) => sum + li.quantity * li.unit_price,
    0
  );
  const editTotal = editSubtotal - editDiscount;

  // WhatsApp payment message
  const customerPhone = invoice.customer?.phone_number;
  const paymentMsg = invoice.status === "finalized" && customerPhone
    ? `Hi ${invoice.customer?.name},\n\nPlease find the details for your plant order invoice:\n\nInvoice: ${invoice.invoice_number}\nAmount: ₹${invoice.total.toLocaleString("en-IN")}\n\nPlease let us know once payment is done.\n\n– Team Nuvvy`
    : null;

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-charcoal hover:text-forest"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1
              className="text-xl text-charcoal"
              style={{
                fontFamily: "var(--font-cormorant, serif)",
                fontWeight: 500,
              }}
            >
              {invoice.invoice_number}
            </h1>
            <p className="text-xs text-sage">
              {invoice.customer?.name ?? "Unknown Customer"}
              {invoice.customer?.societies?.name &&
                ` · ${invoice.customer.societies.name}`}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[700px] mx-auto">
        {/* Invoice info */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-sage">Customer</span>
            <span className="text-charcoal font-medium">
              {invoice.customer?.name}
            </span>
          </div>
          {invoice.customer?.address && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Address</span>
              <span className="text-charcoal text-right max-w-[60%]">
                {invoice.customer.address}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-sage">Created</span>
            <span className="text-charcoal">
              {formatDate(invoice.created_at.split("T")[0])}
            </span>
          </div>
          {invoice.finalized_at && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Finalized</span>
              <span className="text-charcoal">
                {formatDate(invoice.finalized_at.split("T")[0])}
              </span>
            </div>
          )}
          {invoice.paid_at && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Paid</span>
              <span className="text-forest font-medium">
                {formatDate(invoice.paid_at.split("T")[0])}
              </span>
            </div>
          )}
          {invoice.plant_order_id && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Plant Order</span>
              <button
                onClick={() =>
                  router.push(`/ops/plant-orders/${invoice.plant_order_id}`)
                }
                className="text-forest hover:text-garden text-sm font-medium underline"
              >
                View Order
              </button>
            </div>
          )}
        </div>

        {/* Line items — view mode */}
        {!editing && (
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-sage uppercase tracking-widest">
                Line Items
              </p>
              {invoice.status === "draft" && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 text-[10px] text-sage uppercase tracking-widest font-medium pb-2 border-b border-stone/30">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
            </div>

            {/* Items */}
            {invoice.items.map((li, i) => (
              <div
                key={li.id ?? i}
                className="grid grid-cols-[1fr_60px_80px_80px] gap-2 py-2 text-sm border-b border-stone/10 last:border-0"
              >
                <span className="text-charcoal">{li.description}</span>
                <span className="text-charcoal text-right">{li.quantity}</span>
                <span className="text-charcoal text-right">
                  ₹{li.unit_price.toLocaleString("en-IN")}
                </span>
                <span className="text-charcoal text-right font-medium">
                  ₹{li.total.toLocaleString("en-IN")}
                </span>
              </div>
            ))}

            {/* Totals */}
            <div className="pt-3 mt-2 border-t border-stone/40 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-sage">Subtotal</span>
                <span className="text-charcoal">
                  ₹{invoice.subtotal.toLocaleString("en-IN")}
                </span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-forest">Discount</span>
                  <span className="text-forest">
                    -₹{invoice.discount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span className="text-charcoal">Total</span>
                <span className="text-charcoal">
                  ₹{invoice.total.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-3 pt-3 border-t border-stone/30">
                <p className="text-[10px] text-sage uppercase tracking-widest font-medium mb-1">
                  Notes
                </p>
                <p className="text-sm text-charcoal">{invoice.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Line items — edit mode */}
        {editing && (
          <div className="bg-offwhite rounded-2xl border border-forest/40 p-4">
            <p className="text-xs font-medium text-forest uppercase tracking-widest mb-3">
              Edit Line Items
            </p>

            <div className="space-y-3">
              {editItems.map((li, i) => (
                <div
                  key={i}
                  className="bg-cream rounded-xl p-3 border border-stone/30"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] text-sage font-medium">
                      Item {i + 1}
                    </span>
                    {editItems.length > 1 && (
                      <button
                        onClick={() => removeLineItem(i)}
                        className="text-terra hover:text-terra/80"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    className={`${INPUT_CLS} mb-2`}
                    value={li.description}
                    onChange={(e) =>
                      updateLineItem(i, { description: e.target.value })
                    }
                    placeholder="Description"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-sage mb-0.5">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={`${INPUT_CLS} text-center`}
                        value={li.quantity}
                        onChange={(e) =>
                          updateLineItem(i, {
                            quantity: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-sage mb-0.5">
                        Unit Price (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        className={INPUT_CLS}
                        value={li.unit_price}
                        onChange={(e) =>
                          updateLineItem(i, {
                            unit_price: Math.max(
                              0,
                              parseFloat(e.target.value) || 0
                            ),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-sage mb-0.5">
                        Total
                      </label>
                      <p className="px-3 py-2.5 text-sm text-charcoal font-medium">
                        ₹
                        {(li.quantity * li.unit_price).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addLineItem}
              className="flex items-center gap-1 text-sm text-forest hover:text-garden font-medium mt-3"
            >
              <Plus size={14} /> Add Line Item
            </button>

            {/* Discount + Notes */}
            <div className="mt-4 pt-3 border-t border-stone/30 space-y-3">
              <div>
                <label className="block text-xs text-sage mb-1">
                  Discount (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  className={`${INPUT_CLS} w-40`}
                  value={editDiscount}
                  onChange={(e) =>
                    setEditDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">Notes</label>
                <textarea
                  className={`${INPUT_CLS} min-h-[60px]`}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Payment terms, notes to customer…"
                />
              </div>
            </div>

            {/* Edit totals */}
            <div className="mt-3 pt-3 border-t border-stone/40 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-sage">Subtotal</span>
                <span className="text-charcoal">
                  ₹{editSubtotal.toLocaleString("en-IN")}
                </span>
              </div>
              {editDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-forest">Discount</span>
                  <span className="text-forest">
                    -₹{editDiscount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span className="text-charcoal">Total</span>
                <span className="text-charcoal">
                  ₹{editTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  editItems.filter((li) => li.description.trim()).length === 0
                }
                className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {/* WhatsApp payment message (finalized invoices) */}
        {paymentMsg && customerPhone && (
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-sage uppercase tracking-widest">
                Payment Request
              </p>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(paymentMsg);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
              >
                {copied ? (
                  <>
                    <Check size={12} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-charcoal whitespace-pre-line bg-cream rounded-xl p-3 border border-stone/30 mb-3">
              {paymentMsg}
            </p>
            <a
              href={`https://wa.me/${customerPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(paymentMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#20BD5A] transition-colors"
            >
              Open in WhatsApp
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {invoice.status === "draft" && !editing && (
            <button
              onClick={handleFinalize}
              disabled={actionLoading === "finalize"}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Send size={14} />
              {actionLoading === "finalize"
                ? "Finalizing…"
                : "Finalize Invoice"}
            </button>
          )}

          {invoice.status === "finalized" && (
            <>
              <button
                onClick={handleMarkPaid}
                disabled={actionLoading === "paid"}
                className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard size={14} />
                {actionLoading === "paid" ? "Updating…" : "Mark as Paid"}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={actionLoading === "pdf"}
                className="w-full py-2.5 border border-forest text-forest rounded-xl text-sm font-medium hover:bg-forest/5 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={14} />
                {actionLoading === "pdf"
                  ? "Generating…"
                  : "Download PDF"}
              </button>
              <button
                onClick={handleReopenDraft}
                disabled={actionLoading === "reopen"}
                className="w-full py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Pencil size={14} />
                {actionLoading === "reopen"
                  ? "Reopening…"
                  : "Reopen as Draft"}
              </button>
            </>
          )}

          {invoice.status === "paid" && (
            <button
              onClick={handleDownloadPdf}
              disabled={actionLoading === "pdf"}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Download size={14} />
              {actionLoading === "pdf"
                ? "Generating…"
                : "Download PDF"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
