"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Sprout, Pencil, X, Loader2, Check, Copy, Calendar as CalendarIcon, CheckCircle, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import PlantSelector from "@/components/ops/PlantSelector";
import WhatsAppDraftButton from "@/components/ops/WhatsAppDraftButton";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  requested: { cls: "bg-stone/20 text-charcoal", label: "Requested" },
  trip_assigned: { cls: "bg-blue-50 text-blue-700", label: "Trip Assigned" },
  procured: { cls: "bg-forest/10 text-forest", label: "Procured" },
  installed: { cls: "bg-forest text-offwhite", label: "Installed" },
  cancelled: { cls: "bg-stone/20 text-sage", label: "Cancelled" },
  deferred: { cls: "bg-amber-50 text-amber-700", label: "Deferred" },
};

type OrderItem = {
  id: string;
  plant_id: string | null;
  plant_name: string;
  quantity: number;
  note: string | null;
  status: string;
  qty_procured: number | null;
  actual_unit_price: number | null;
  nursery_name: string | null;
  installed_at: string | null;
  install_service_id: string | null;
  thumbnail_url: string | null;
};

type OrderDetail = {
  id: string;
  status: string;
  request_source: string;
  due_date: string;
  notes: string | null;
  created_at: string;
  customer: {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    societies: { name: string } | null;
  } | null;
  items: OrderItem[];
};

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
};

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_at: string | null;
  created_at: string;
  items: InvoiceItem[];
};

type ItemDraft = {
  plant_id: string | null;
  plant_name: string;
  price_band: string | null;
  quantity: number;
  note: string;
};

export default function PlantOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const loadInvoice = useCallback(async () => {
    // Check if an invoice already exists for this order
    const res = await fetch(`/api/ops/invoices?plant_order_id=${orderId}`);
    if (res.ok) {
      const json = await res.json();
      const invoices = json.data ?? [];
      if (invoices.length > 0) {
        // Fetch full detail with items
        const detailRes = await fetch(`/api/ops/invoices/${invoices[0].id}`);
        if (detailRes.ok) {
          const detailJson = await detailRes.json();
          setInvoice(detailJson.data ?? null);
          return;
        }
      }
    }
    setInvoice(null);
  }, [orderId]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}`);
    const json = await res.json();
    setOrder(json.data ?? null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
    loadInvoice();
  }, [load, loadInvoice]);

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancellation_reason: cancelReason }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to cancel");
    }
    setCancelling(false);
    setShowCancel(false);
    setCancelReason("");
    load();
  }

  async function handleAddToService(item: OrderItem) {
    setActionLoading(`install-${item.id}`);
    const res = await fetch(`/api/ops/plant-order-items/${item.id}/add-to-service`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? "Failed to add to service");
    }
    setActionLoading(null);
    load();
  }

  async function handleMarkInstalled(item: OrderItem) {
    setActionLoading(`installed-${item.id}`);
    const res = await fetch(`/api/ops/plant-order-items/${item.id}/mark-installed`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to mark installed");
    }
    setActionLoading(null);
    load();
  }

  async function handleCreateInvoice() {
    setInvoiceLoading(true);
    const res = await fetch("/api/ops/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plant_order_id: orderId }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? "Failed to create invoice");
    } else {
      await loadInvoice();
    }
    setInvoiceLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-forest" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-terra">Order not found</p>
      </div>
    );
  }

  if (showEdit) {
    return (
      <EditOrderView
        order={order}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); load(); }}
      />
    );
  }

  const badge = STATUS_BADGE[order.status] ?? { cls: "bg-stone/20 text-charcoal", label: order.status };
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = order.due_date < today && !["cancelled", "installed"].includes(order.status);
  const customerPhone = order.customer?.phone_number;
  const societyName = (order.customer?.societies as unknown as { name: string } | null)?.name;

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/ops/plant-orders")} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1
              className="text-xl text-charcoal"
              style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
            >
              {order.customer?.name ?? "Plant Order"}
            </h1>
            <p className="text-xs text-sage">
              {societyName && `${societyName} · `}
              {order.customer?.address && `${order.customer.address} · `}
              {formatDate(order.created_at.split("T")[0])}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[700px] mx-auto">
        {/* Order info */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-sage">Due Date</span>
            <span className={`font-medium ${isOverdue ? "text-terra" : "text-charcoal"}`}>
              {formatDate(order.due_date)}{isOverdue && " (overdue)"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-sage">Source</span>
            <span className="text-charcoal capitalize">{order.request_source.replace("_", " ")}</span>
          </div>
          {order.notes && (
            <div className="border-t border-stone/30 pt-2">
              <p className="text-xs text-sage mb-0.5">Notes</p>
              <p className="text-sm text-charcoal">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">
            Items ({order.items.length})
          </p>
          <div className="space-y-3">
            {order.items.map((item) => {
              const itemBadge = STATUS_BADGE[item.status] ?? { cls: "bg-stone/20 text-charcoal", label: item.status };
              return (
                <div key={item.id} className="border-b border-stone/20 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start gap-3">
                    {/* Thumbnail or placeholder */}
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt={item.plant_name}
                        className="w-12 h-12 rounded-xl object-cover border border-stone/40 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-forest/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Sprout size={20} className="text-forest" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-charcoal">{item.plant_name}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-semibold text-charcoal bg-cream border border-stone/40 px-2.5 py-0.5 rounded-lg">
                            Qty: {item.quantity}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${itemBadge.cls}`}>
                            {itemBadge.label}
                          </span>
                        </div>
                      </div>
                      {item.note && <p className="text-xs text-sage mt-0.5">{item.note}</p>}
                      {item.qty_procured != null && (
                        <p className="text-xs text-forest mt-0.5">
                          Procured: {item.qty_procured} @ ₹{item.actual_unit_price}
                          {item.nursery_name && ` from ${item.nursery_name}`}
                        </p>
                      )}
                      {item.installed_at && (
                        <p className="text-xs text-forest mt-0.5">
                          Installed {formatDate(item.installed_at.split("T")[0])}
                        </p>
                      )}

                      {/* Action buttons per item */}
                      {item.status === "procured" && (
                        <div className="flex gap-2 mt-2">
                          {!item.install_service_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddToService(item); }}
                              disabled={actionLoading === `install-${item.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-lg hover:bg-garden disabled:opacity-50 transition-colors"
                            >
                              <CalendarIcon size={12} />
                              {actionLoading === `install-${item.id}` ? "Adding…" : "Add to Next Service"}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkInstalled(item); }}
                            disabled={actionLoading === `installed-${item.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-forest text-forest text-xs font-medium rounded-lg hover:bg-forest/5 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle size={12} />
                            {actionLoading === `installed-${item.id}` ? "Marking…" : "Mark Installed"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* WhatsApp draft message */}
        {customerPhone && order.status !== "cancelled" && (() => {
          let msg = "";
          let label = "";
          if (order.status === "requested") {
            label = "Acknowledgement Message";
            msg = `Hi ${order.customer?.name},\n\nWe've noted your plant request for:\n\n${order.items.map((i) => `- ${i.quantity}x ${i.plant_name}`).join("\n")}\n\nWe'll source these and aim to install them by ${formatDate(order.due_date)}.\n\nWe'll keep you updated once the plants are procured.\n\n– Team Nuvvy`;
          } else if (order.status === "procured") {
            label = "Procurement Update";
            msg = `Hi ${order.customer?.name},\n\nWe've procured the following plants for your home:\n\n${order.items.filter((i) => i.status === "procured" || i.status === "installed").map((i) => `- ${i.qty_procured ?? i.quantity}x ${i.plant_name}`).join("\n")}\n\nWe will install these during your next Nuvvy service visit.\n\n– Team Nuvvy`;
          } else if (order.status === "installed") {
            label = "Installation Update";
            msg = `Hi ${order.customer?.name},\n\nYour new plants have been installed today:\n\n${order.items.filter((i) => i.status === "installed").map((i) => `- ${i.quantity}x ${i.plant_name}`).join("\n")}\n\nNuvvy will continue caring for these plants as part of your regular service.\n\n– Team Nuvvy`;
          }
          if (!msg) return null;

          const cleanPhone = customerPhone.replace(/[^0-9]/g, "");
          const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

          return (
            <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-sage uppercase tracking-widest">{label}</p>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(msg);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
                >
                  {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <p className="text-sm text-charcoal whitespace-pre-line bg-cream rounded-xl p-3 border border-stone/30 mb-3">{msg}</p>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#20BD5A] transition-colors"
              >
                Open in WhatsApp
              </a>
            </div>
          );
        })()}

        {/* Invoice section */}
        {(() => {
          const hasBillableItems = order.items.some(
            (i) => ["procured", "installed"].includes(i.status) && i.qty_procured != null && i.actual_unit_price != null
          );

          if (!hasBillableItems && !invoice) return null;

          if (!invoice) {
            return (
              <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
                <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Invoice</p>
                <p className="text-sm text-charcoal mb-3">
                  {order.items.filter((i) => ["procured", "installed"].includes(i.status)).length} item(s) ready to be invoiced.
                </p>
                <button
                  onClick={handleCreateInvoice}
                  disabled={invoiceLoading}
                  className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  <FileText size={14} />
                  {invoiceLoading ? "Creating…" : "Create Invoice"}
                </button>
              </div>
            );
          }

          const statusBadge: Record<string, { cls: string; label: string }> = {
            draft: { cls: "bg-amber-50 text-amber-700", label: "Draft" },
            finalized: { cls: "bg-blue-50 text-blue-700", label: "Finalized" },
            paid: { cls: "bg-forest text-offwhite", label: "Paid" },
          };
          const invBadge = statusBadge[invoice.status] ?? { cls: "bg-stone/20 text-charcoal", label: invoice.status };

          return (
            <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-sage uppercase tracking-widest">Invoice</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${invBadge.cls}`}>{invBadge.label}</span>
              </div>
              <div className="text-sm text-charcoal mb-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-sage">Invoice #</span>
                  <span className="font-medium">{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>₹{invoice.total.toLocaleString("en-IN")}</span>
                </div>
                {invoice.paid_at && (
                  <p className="text-xs text-forest">Paid on {formatDate(invoice.paid_at.split("T")[0])}</p>
                )}
              </div>
              <button
                onClick={() => router.push(`/ops/invoices/${invoice.id}`)}
                className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden flex items-center justify-center gap-2 transition-colors"
              >
                <FileText size={14} />
                View Invoice
              </button>
            </div>
          );
        })()}

        {/* Action buttons */}
        <div className="space-y-2">
          {order.status === "requested" && (
            <button
              onClick={() => setShowEdit(true)}
              className="w-full py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite flex items-center justify-center gap-1.5"
            >
              <Pencil size={14} /> Edit Order
            </button>
          )}
          {!["cancelled", "installed"].includes(order.status) && (
            <button
              onClick={() => setShowCancel(true)}
              className="w-full py-2.5 border border-terra/40 rounded-xl text-sm text-terra hover:bg-terra/5 flex items-center justify-center gap-1.5"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
            <h2 className="font-semibold text-charcoal mb-3">Cancel Order</h2>
            <p className="text-sm text-sage mb-3">This will cancel all pending items. Procured/installed items will not be affected.</p>
            <input
              className={INPUT_CLS}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation…"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowCancel(false)} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal">
                Go Back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
                className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Order View ──────────────────────────────────────────────────────────

function EditOrderView({
  order,
  onClose,
  onSaved,
}: {
  order: OrderDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<ItemDraft[]>(
    order.items.map((i) => ({
      plant_id: i.plant_id,
      plant_name: i.plant_name,
      price_band: null,
      quantity: i.quantity,
      note: i.note ?? "",
    }))
  );
  const [dueDate, setDueDate] = useState(order.due_date);
  const [requestSource, setRequestSource] = useState(order.request_source);
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, updates: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { plant_id: null, plant_name: "", price_band: null, quantity: 1, note: "" }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const validItems = items.filter((i) => i.plant_name.trim());

  async function handleSave() {
    if (validItems.length === 0) {
      setError("At least one plant is required");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/ops/plant-orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        due_date: dueDate,
        request_source: requestSource,
        notes: notes || undefined,
        items: validItems.map((i) => ({
          plant_id: i.plant_id,
          plant_name: i.plant_name,
          quantity: i.quantity,
          note: i.note || undefined,
        })),
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(typeof json.error === "string" ? json.error : "Failed to update");
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <h1
            className="text-xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Edit Order
          </h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[520px] mx-auto">
        {items.map((item, i) => (
          <div key={i} className="bg-offwhite rounded-xl border border-stone/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-sage font-medium">Plant {i + 1}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} className="text-xs text-terra">Remove</button>
              )}
            </div>
            <PlantSelector
              value={item.plant_name ? { plant_id: item.plant_id, plant_name: item.plant_name, price_band: item.price_band } : null}
              onChange={(plant: { plant_id: string | null; plant_name: string; price_band: string | null } | null) => {
                if (plant) updateItem(i, { plant_id: plant.plant_id, plant_name: plant.plant_name, price_band: plant.price_band });
                else updateItem(i, { plant_id: null, plant_name: "", price_band: null });
              }}
            />
            <div className="flex gap-2">
              <div className="w-20">
                <label className="block text-[10px] text-sage mb-0.5">Qty</label>
                <input type="number" min={1} className={`${INPUT_CLS} text-center`} value={item.quantity} onChange={(e) => updateItem(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-sage mb-0.5">Note</label>
                <input className={INPUT_CLS} value={item.note} onChange={(e) => updateItem(i, { note: e.target.value })} placeholder="Size, pot…" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addItem} className="text-sm text-forest hover:text-garden font-medium">+ Add another plant</button>

        <div>
          <label className="block text-xs text-sage mb-1">Due date</label>
          <input type="date" className={INPUT_CLS} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-sage mb-1">Request source</label>
          <select className={INPUT_CLS} value={requestSource} onChange={(e) => setRequestSource(e.target.value)}>
            <option value="customer_requested">Customer Requested</option>
            <option value="replacement">Replacement</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-sage mb-1">Notes</label>
          <textarea className={`${INPUT_CLS} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-terra">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal">Cancel</button>
          <button onClick={handleSave} disabled={saving || validItems.length === 0} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
