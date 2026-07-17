"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Sprout,
  Pencil,
  Loader2,
  FileText,
  CalendarClock,
  XCircle,
  Truck,
  StickyNote,
  Send,
  Trash2,
  Plus,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { isOverdue, isDueToday, relativeTime, formatTimestamp } from "@/components/ops/leads/leadConstants";
import PlantSelector from "@/components/ops/PlantSelector";
import CuratedListPanel from "./CuratedListPanel";
import {
  ORDER_TRANSITIONS,
  PLANT_ORDER_STATUS_LABELS,
  PLANT_ORDER_ITEM_STATUS_LABELS,
  ORDER_CLOSED_REASONS,
  ORDER_CLOSED_REASON_LABELS,
  TERMINAL_ORDER_STATUSES,
  type PlantOrderStatus,
  type PlantOrderItemStatus,
} from "@/lib/schemas/plant-order";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const ORDER_BADGE: Record<PlantOrderStatus, string> = {
  interested: "bg-stone/20 text-charcoal",
  finalizing: "bg-blue-50 text-blue-700",
  confirmed: "bg-forest/10 text-forest",
  scheduled: "bg-amber-50 text-amber-700",
  installed: "bg-garden/15 text-forest",
  invoiced: "bg-forest text-offwhite",
  no_longer_interested: "bg-stone/20 text-sage",
};

const ITEM_BADGE: Record<PlantOrderItemStatus, string> = {
  pending: "bg-stone/20 text-charcoal",
  on_trip: "bg-blue-50 text-blue-700",
  procured: "bg-forest/10 text-forest",
  partial: "bg-amber-50 text-amber-700",
  deferred: "bg-amber-50 text-amber-700",
  cancelled: "bg-stone/20 text-sage",
};

// Item editing (intent) is only possible before procurement begins.
const ITEM_EDITABLE: PlantOrderStatus[] = ["interested", "finalizing"];

type OrderItem = {
  id: string;
  plant_id: string | null;
  plant_name: string;
  quantity: number;
  note: string | null;
  source: "manual" | "curated" | null;
  status: PlantOrderItemStatus;
  qty_procured: number | null;
  actual_unit_price: number | null;
  nursery_name: string | null;
  installed_at: string | null;
  install_service_id: string | null;
  thumbnail_url: string | null;
};

type HistoryEvent = {
  kind: "note" | "created" | "status_changed" | "follow_up";
  id: string;
  at: string;
  actor_name: string | null;
  body: string | null;
  detail: string | null;
};

type OrderDetail = {
  id: string;
  status: PlantOrderStatus;
  request_source: string;
  due_date: string | null;
  next_follow_up_at: string | null;
  closed_reason: string | null;
  shortlist_version_id: string | null;
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

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_at: string | null;
  created_at: string;
};

type ItemDraft = {
  plant_id: string | null;
  plant_name: string;
  price_band: string | null;
  quantity: number;
  note: string;
};

function HistoryIcon({ kind }: { kind: HistoryEvent["kind"] }) {
  if (kind === "created") return <Plus size={14} className="text-sage" />;
  if (kind === "status_changed") return <ArrowRight size={14} className="text-forest" />;
  if (kind === "follow_up") return <CalendarClock size={14} className="text-garden" />;
  return <StickyNote size={14} className="text-forest" />;
}

function historyVerb(ev: HistoryEvent): string {
  switch (ev.kind) {
    case "created":
      return ev.detail ? `created this order as ${ev.detail}` : "created this order";
    case "status_changed":
      return `moved this order: ${ev.detail ?? ""}`;
    case "follow_up":
      return ev.detail === "cleared" || !ev.detail
        ? "cleared the follow-up"
        : `set a follow-up for ${formatDate(ev.detail)}`;
    default:
      return "added a note";
  }
}

export default function PlantOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Follow-up + close controls
  const [followUp, setFollowUp] = useState("");
  const [showCloseReasons, setShowCloseReasons] = useState(false);

  // History timeline (notes + audited pipeline changes)
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const loadInvoice = useCallback(async () => {
    const res = await fetch(`/api/ops/invoices?plant_order_id=${orderId}`);
    if (res.ok) {
      const json = await res.json();
      const invoices = json.data ?? [];
      if (invoices.length > 0) {
        setInvoice(invoices[0]);
        return;
      }
    }
    setInvoice(null);
  }, [orderId]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}`);
    const json = await res.json();
    const data: OrderDetail | null = json.data ?? null;
    setOrder(data);
    setFollowUp(data?.next_follow_up_at ?? "");
    setLoading(false);
  }, [orderId]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/ops/plant-orders/${orderId}/history`);
    if (res.ok) {
      const json = await res.json();
      setHistory(json.data ?? []);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    loadInvoice();
    loadHistory();
  }, [load, loadInvoice, loadHistory]);

  async function handleAddNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody.trim() }),
    });
    setSavingNote(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed to add note");
      return;
    }
    setNoteBody("");
    loadHistory();
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this plant order/interest permanently? This removes its line items and notes and cannot be undone."
      )
    )
      return;
    setDeleting(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed to delete");
      return;
    }
    router.push("/ops/plant-orders");
  }

  // ── Pipeline mutations (all manual via PUT) ────────────────────────────────
  async function putOrder(patch: Record<string, unknown>, errLabel: string) {
    setActionLoading(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setActionLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : errLabel);
      return false;
    }
    await Promise.all([load(), loadHistory()]);
    return true;
  }

  async function handleTransition(to: PlantOrderStatus) {
    await putOrder({ status: to }, "Failed to update status");
  }

  async function handleSaveFollowUp() {
    await putOrder({ next_follow_up_at: followUp || null }, "Failed to set follow-up");
  }

  async function handleClearFollowUp() {
    setFollowUp("");
    await putOrder({ next_follow_up_at: null }, "Failed to clear follow-up");
  }

  async function handleMarkNoLongerInterested(reason: string) {
    const ok = await putOrder(
      { status: "no_longer_interested", closed_reason: reason },
      "Failed to close order"
    );
    if (ok) setShowCloseReasons(false);
  }

  async function handleCreateInvoice() {
    setInvoiceLoading(true);
    const res = await fetch("/api/ops/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plant_order_id: orderId }),
    });
    const json = await res.json();
    if (!res.ok) alert(json.error ?? "Failed to create invoice");
    else await loadInvoice();
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
        onSaved={() => {
          setShowEdit(false);
          load();
        }}
      />
    );
  }

  const isTerminal = (TERMINAL_ORDER_STATUSES as string[]).includes(order.status);
  const dueOverdue =
    isOverdue(order.due_date) && !isTerminal;
  const societyName = (order.customer?.societies as unknown as { name: string } | null)?.name;

  // Forward transitions excluding the close exit (which has its own action).
  const nextStates = (ORDER_TRANSITIONS[order.status] ?? []).filter(
    (s) => s !== "no_longer_interested"
  );
  const canClose = (ORDER_TRANSITIONS[order.status] ?? []).includes("no_longer_interested");

  // Best-effort procurement rollup (read-only — PRD §4 / FD-14).
  const total = order.items.length;
  const procuredCount = order.items.filter((i) => i.status === "procured").length;
  const onTripCount = order.items.filter((i) => i.status === "on_trip").length;

  // Same plant appearing as BOTH a manual and a curated row — flagged, never
  // auto-merged (LOCKED DESIGN DECISIONS).
  const duplicatePlantIds = (() => {
    const manual = new Set<string>();
    const curated = new Set<string>();
    order.items.forEach((i) => {
      if (!i.plant_id) return;
      if (i.source === "curated") curated.add(i.plant_id);
      else manual.add(i.plant_id); // null/legacy source treated as manual
    });
    const dup = new Set<string>();
    manual.forEach((pid) => {
      if (curated.has(pid)) dup.add(pid);
    });
    return dup;
  })();

  const followUpDirty = (followUp || "") !== (order.next_follow_up_at || "");

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/ops/plant-orders")} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl text-charcoal truncate"
              style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
            >
              {order.customer?.name ?? "Plant Order"}
            </h1>
            <p className="text-xs text-sage truncate">
              {societyName && `${societyName} · `}
              {order.customer?.address && `${order.customer.address} · `}
              {formatDate(order.created_at.split("T")[0])}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${ORDER_BADGE[order.status] ?? "bg-stone/20 text-charcoal"}`}>
            {PLANT_ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[700px] mx-auto">
        {/* ── Pipeline controls ─────────────────────────────────────────────── */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Pipeline</p>

          {isTerminal ? (
            <p className="text-sm text-charcoal">
              {order.status === "invoiced"
                ? "This order is complete (invoiced)."
                : `Closed — ${order.closed_reason ? ORDER_CLOSED_REASON_LABELS[order.closed_reason as keyof typeof ORDER_CLOSED_REASON_LABELS] ?? order.closed_reason : "no longer interested"}.`}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {nextStates.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleTransition(s)}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite text-xs font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors"
                  >
                    Move to {PLANT_ORDER_STATUS_LABELS[s]}
                    <ArrowRight size={12} />
                  </button>
                ))}
              </div>

              {/* Follow-up date */}
              <div className="border-t border-stone/30 pt-3">
                <label className="flex items-center gap-1.5 text-xs text-sage mb-1">
                  <CalendarClock size={13} /> Remind me on
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                  <button
                    onClick={handleSaveFollowUp}
                    disabled={actionLoading || !followUpDirty}
                    className="px-3 py-2 bg-forest text-offwhite text-xs font-medium rounded-xl hover:bg-garden disabled:opacity-40 whitespace-nowrap"
                  >
                    Save
                  </button>
                  {order.next_follow_up_at && (
                    <button
                      onClick={handleClearFollowUp}
                      disabled={actionLoading}
                      className="px-3 py-2 border border-stone text-charcoal text-xs font-medium rounded-xl hover:bg-cream whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {order.next_follow_up_at && (
                  <p
                    className={`text-xs mt-1 ${isOverdue(order.next_follow_up_at) ? "text-terra" : isDueToday(order.next_follow_up_at) ? "text-garden" : "text-sage"}`}
                  >
                    Next follow-up: {formatDate(order.next_follow_up_at)}
                    {isOverdue(order.next_follow_up_at) && " (overdue)"}
                    {isDueToday(order.next_follow_up_at) && " (today)"}
                  </p>
                )}
              </div>

              {/* No longer interested */}
              {canClose && (
                <div className="border-t border-stone/30 pt-3">
                  {!showCloseReasons ? (
                    <button
                      onClick={() => setShowCloseReasons(true)}
                      className="flex items-center gap-1.5 text-xs text-terra hover:text-terra/80 font-medium"
                    >
                      <XCircle size={13} /> Mark no longer interested
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-sage">Reason for closing:</p>
                      <div className="flex flex-wrap gap-2">
                        {ORDER_CLOSED_REASONS.map((r) => (
                          <button
                            key={r}
                            onClick={() => handleMarkNoLongerInterested(r)}
                            disabled={actionLoading}
                            className="px-3 py-1.5 border border-terra/40 text-terra text-xs font-medium rounded-xl hover:bg-terra/5 disabled:opacity-50"
                          >
                            {ORDER_CLOSED_REASON_LABELS[r]}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowCloseReasons(false)}
                          className="px-3 py-1.5 text-xs text-sage hover:text-charcoal"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Order info ────────────────────────────────────────────────────── */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-sage">Install target</span>
            <span className={`font-medium ${dueOverdue ? "text-terra" : "text-charcoal"}`}>
              {order.due_date ? formatDate(order.due_date) : "Not set"}
              {dueOverdue && " (overdue)"}
            </span>
          </div>
          {order.shortlist_version_id && (
            <div className="flex justify-between text-sm">
              <span className="text-sage">Created from</span>
              <span className="text-forest">Shortlist</span>
            </div>
          )}
          {order.notes && (
            <div className="border-t border-stone/30 pt-2">
              <p className="text-xs text-sage mb-0.5">Notes</p>
              <p className="text-sm text-charcoal whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>

        {/* ── Curated plant list (order-bound shortlist) ────────────────────── */}
        <CuratedListPanel
          orderId={order.id}
          orderStatus={order.status}
          onChanged={() => {
            load();
            loadHistory();
          }}
        />

        {/* ── Procurement rollup (read-only, links to Procurement) ──────────── */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-sage uppercase tracking-widest">Procurement</p>
            <button
              onClick={() => router.push("/ops/procurement")}
              className="flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
            >
              <Truck size={12} /> View in Procurement
            </button>
          </div>
          {total === 0 ? (
            <p className="text-sm text-stone">—</p>
          ) : (
            <p className="text-sm text-charcoal">
              {procuredCount} of {total} procured
              {onTripCount > 0 && <span className="text-sage"> · {onTripCount} on a trip</span>}
            </p>
          )}
        </div>

        {/* ── Items (intent, read-only here) ────────────────────────────────── */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">
            Items ({order.items.length})
          </p>
          {order.items.length === 0 ? (
            <p className="text-sm text-stone">
              No plants chosen yet.
              {ITEM_EDITABLE.includes(order.status) && " Use “Edit items” to add them."}
            </p>
          ) : (
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="border-b border-stone/20 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start gap-3">
                    {item.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-charcoal truncate">{item.plant_name}</p>
                          {item.source === "curated" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap bg-forest/10 text-forest">
                              Curated
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-semibold text-charcoal bg-cream border border-stone/40 px-2.5 py-0.5 rounded-lg">
                            Qty: {item.quantity}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${ITEM_BADGE[item.status] ?? "bg-stone/20 text-charcoal"}`}>
                            {PLANT_ORDER_ITEM_STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </div>
                      </div>
                      {item.plant_id && duplicatePlantIds.has(item.plant_id) && (
                        <p className="text-xs text-amber-700 mt-0.5">
                          Possible duplicate — this plant is on both the manual and curated list.
                        </p>
                      )}
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Invoice ───────────────────────────────────────────────────────── */}
        {(() => {
          const hasBillableItems = order.items.some(
            (i) => i.status === "procured" && i.qty_procured != null && i.actual_unit_price != null
          );
          if (!hasBillableItems && !invoice) return null;

          if (!invoice) {
            return (
              <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
                <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Invoice</p>
                <p className="text-sm text-charcoal mb-3">
                  {order.items.filter((i) => i.status === "procured").length} item(s) ready to be invoiced.
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

          const statusBadge: Record<string, string> = {
            draft: "bg-amber-50 text-amber-700",
            finalized: "bg-blue-50 text-blue-700",
            paid: "bg-forest text-offwhite",
          };

          return (
            <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-sage uppercase tracking-widest">Invoice</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge[invoice.status] ?? "bg-stone/20 text-charcoal"}`}>
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
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

        {/* ── Notes & history ───────────────────────────────────────────────── */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">History &amp; notes</p>

          {/* Composer */}
          <div className="space-y-2 mb-4">
            <textarea
              className={`${INPUT_CLS} min-h-[64px]`}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a note — what was said, promised, pending…"
            />
            <div className="flex justify-end">
              <button
                onClick={handleAddNote}
                disabled={savingNote || !noteBody.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-40"
              >
                <Send size={14} /> {savingNote ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>

          {/* Timeline — notes + audited pipeline changes */}
          {history.length === 0 ? (
            <p className="text-sm text-stone">No history yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((ev) => (
                <li key={`${ev.kind}-${ev.id}`} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-cream border border-stone/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <HistoryIcon kind={ev.kind} />
                  </span>
                  <div className="min-w-0 flex-1 pb-3 border-b border-stone/20 last:border-0">
                    <p className="text-xs text-sage">
                      <span className="text-charcoal font-medium">{ev.actor_name || "Someone"}</span>{" "}
                      {historyVerb(ev)}
                      {" · "}
                      <span title={formatTimestamp(ev.at)}>{relativeTime(ev.at)}</span>
                    </p>
                    {ev.kind === "note" && ev.body && (
                      <p className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap mt-1">{ev.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Edit items (intent only) ──────────────────────────────────────── */}
        {ITEM_EDITABLE.includes(order.status) && (
          <button
            onClick={() => setShowEdit(true)}
            className="w-full py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite flex items-center justify-center gap-1.5"
          >
            <Pencil size={14} /> Edit items &amp; details
          </button>
        )}

        {/* ── Delete (hard) ─────────────────────────────────────────────────── */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-2 text-terra hover:bg-terra/5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete order / interest"}
        </button>
      </div>
    </div>
  );
}

// ─── Edit Order View (intent) ───────────────────────────────────────────────

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
  const [dueDate, setDueDate] = useState(order.due_date ?? "");
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
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/ops/plant-orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        due_date: dueDate || undefined,
        notes: notes || undefined,
        items: validItems.map((i) => ({
          plant_id: i.plant_id ?? undefined,
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
              <button onClick={() => removeItem(i)} className="text-xs text-terra">
                Remove
              </button>
            </div>
            <PlantSelector
              value={item.plant_name ? { plant_id: item.plant_id, plant_name: item.plant_name, price_band: item.price_band } : null}
              onChange={(plant: { plant_id: string | null; plant_name: string; price_band: string | null } | null) => {
                if (plant) updateItem(i, { plant_id: plant.plant_id, plant_name: plant.plant_name, price_band: plant.price_band });
                else updateItem(i, { plant_id: null, plant_name: "", price_band: null });
              }}
            />
            <div className="flex gap-2">
              <div>
                <label className="block text-[10px] text-sage mb-0.5">Qty</label>
                <div className="flex items-center border border-stone rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateItem(i, { quantity: Math.max(1, item.quantity - 1) })}
                    className="w-10 h-10 flex items-center justify-center text-lg text-charcoal hover:bg-cream active:bg-stone/20"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-medium text-charcoal">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateItem(i, { quantity: item.quantity + 1 })}
                    className="w-10 h-10 flex items-center justify-center text-lg text-charcoal hover:bg-cream active:bg-stone/20"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-sage mb-0.5">Note</label>
                <input className={INPUT_CLS} value={item.note} onChange={(e) => updateItem(i, { note: e.target.value })} placeholder="Size, pot…" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addItem} className="text-sm text-forest hover:text-garden font-medium">
          + Add a plant
        </button>

        <div>
          <label className="block text-xs text-sage mb-1">
            Install target <span className="text-stone">(optional)</span>
          </label>
          <input type="date" className={INPUT_CLS} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-sage mb-1">Notes</label>
          <textarea className={`${INPUT_CLS} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-terra">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
