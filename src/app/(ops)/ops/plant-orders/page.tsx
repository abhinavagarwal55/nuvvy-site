"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDate } from "@/lib/utils/format-date";
import { Plus, X, ChevronRight, Loader2 } from "lucide-react";
import PlantSelector from "@/components/ops/PlantSelector";
import { isOverdue, isDueToday } from "@/components/ops/leads/leadConstants";
import {
  PLANT_ORDER_STATUS_LABELS,
  LIVE_ORDER_STATUSES,
  CREATABLE_ORDER_STATUSES,
  type PlantOrderStatus,
} from "@/lib/schemas/plant-order";

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

type Procurement = {
  total: number;
  procured: number;
  on_trip: number;
  pending: number;
  partial: number;
  deferred: number;
  cancelled: number;
};

type PlantOrder = {
  id: string;
  customer_id: string;
  status: PlantOrderStatus;
  request_source: string;
  due_date: string | null;
  next_follow_up_at: string | null;
  closed_reason: string | null;
  notes: string | null;
  created_at: string;
  customer_name: string | null;
  society_name: string | null;
  item_count: number;
  items_summary: string;
  procurement: Procurement;
};

type Customer = {
  id: string;
  name: string;
  phone_number: string | null;
  society_id: string | null;
  societies: { name: string } | null;
};

type SelectedPlant = {
  plant_id: string | null;
  plant_name: string;
  price_band: string | null;
};

type PlantRow = {
  key: number;
  plant: SelectedPlant | null;
  quantity: number;
  note: string;
};

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

// Pipeline tabs (FD-15 — mirrors the Leads module's Active / Follow-up / Closed).
type TabKey = "active" | "follow_ups" | "invoiced" | "no_longer_interested";
const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "follow_ups", label: "Follow-ups due" },
  { key: "invoiced", label: "Invoiced" },
  { key: "no_longer_interested", label: "No longer interested" },
];

const STATUS_BADGE: Record<PlantOrderStatus, string> = {
  interested: "bg-stone/20 text-charcoal",
  finalizing: "bg-blue-50 text-blue-700",
  confirmed: "bg-forest/10 text-forest",
  scheduled: "bg-amber-50 text-amber-700",
  installed: "bg-garden/15 text-forest",
  invoiced: "bg-forest text-offwhite",
  no_longer_interested: "bg-stone/20 text-sage",
};

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

let rowKeyCounter = 0;
function nextRowKey() {
  return ++rowKeyCounter;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function followUpClass(date: string | null): string {
  if (!date) return "text-sage";
  if (isOverdue(date)) return "text-terra font-medium";
  if (isDueToday(date)) return "text-garden font-medium";
  return "text-charcoal";
}

/* ========================================================================== */
/*  Slide-up Modal                                                            */
/* ========================================================================== */

function SlideUpModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-offwhite rounded-t-2xl p-5 pb-8 mb-16 max-h-[85vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-offwhite pb-2">
          <h2
            className="text-lg text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            {title}
          </h2>
          <button onClick={onClose} className="p-1 text-sage hover:text-charcoal">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Page                                                                      */
/* ========================================================================== */

export default function PlantOrdersPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("active");
  const [stageFilter, setStageFilter] = useState<"all" | PlantOrderStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    customerName: string;
    items: { plant_name: string; quantity: number }[];
  } | null>(null);

  const apiUrl = useMemo(() => {
    if (tab === "follow_ups") return "/api/ops/plant-orders?follow_ups_due=1";
    if (tab === "invoiced") return "/api/ops/plant-orders?status=invoiced";
    if (tab === "no_longer_interested")
      return "/api/ops/plant-orders?status=no_longer_interested";
    return "/api/ops/plant-orders"; // active: fetch all, filter to live states client-side
  }, [tab]);

  const { data, isLoading, mutate } = useSWR<{ data: PlantOrder[] }>(apiUrl, fetcher);
  const rawOrders = useMemo(() => data?.data ?? [], [data]);

  // Active tab: full live set drives the stage pills (with counts); the stage
  // filter then narrows what's shown.
  const activeOrders = useMemo(
    () => rawOrders.filter((o) => (LIVE_ORDER_STATUSES as string[]).includes(o.status)),
    [rawOrders]
  );
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: activeOrders.length };
    for (const s of LIVE_ORDER_STATUSES) {
      counts[s] = activeOrders.filter((o) => o.status === s).length;
    }
    return counts;
  }, [activeOrders]);

  const orders =
    tab !== "active"
      ? rawOrders
      : stageFilter === "all"
        ? activeOrders
        : activeOrders.filter((o) => o.status === stageFilter);

  const { data: customersData } = useSWR<{ data: Customer[] }>(
    createOpen ? "/api/ops/customers?status=ACTIVE" : null,
    fetcher
  );
  const customers = customersData?.data ?? [];

  const tabPillCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
      active ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"
    }`;

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Sticky header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Plant Orders
          </h1>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
          >
            <Plus size={14} />
            New Order / Interest
          </button>
        </div>

        {/* Pipeline tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button key={t.key} className={tabPillCls(tab === t.key)} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Stage filter (Active tab only) — narrows the live pipeline by stage */}
        {tab === "active" && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {([{ value: "all", label: "All" }, ...LIVE_ORDER_STATUSES.map((s) => ({ value: s, label: PLANT_ORDER_STATUS_LABELS[s] }))] as { value: "all" | PlantOrderStatus; label: string }[]).map((opt) => {
              const selected = stageFilter === opt.value;
              const count = stageCounts[opt.value] ?? 0;
              return (
                <button
                  key={opt.value}
                  onClick={() => setStageFilter(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                    selected ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"
                  }`}
                >
                  {opt.label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                      selected ? "bg-offwhite/25 text-offwhite" : "bg-stone/40 text-charcoal"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        <OrdersList
          orders={orders}
          isLoading={isLoading}
          tab={tab}
          onSelect={(id) => router.push(`/ops/plant-orders/${id}`)}
        />
      </div>

      {/* Create modal */}
      <SlideUpModal
        open={createOpen && !createdOrder}
        onClose={() => setCreateOpen(false)}
        title="New Plant Order / Interest"
      >
        <CreateOrderForm
          customers={customers}
          onSuccess={(info) => {
            setCreatedOrder(info);
            mutate();
          }}
        />
      </SlideUpModal>

      {/* Created → confirmation */}
      <SlideUpModal
        open={!!createdOrder}
        onClose={() => {
          setCreatedOrder(null);
          setCreateOpen(false);
        }}
        title="Order Created"
      >
        {createdOrder && (
          <CreatedOrderDraft
            order={createdOrder}
            onClose={() => {
              setCreatedOrder(null);
              setCreateOpen(false);
            }}
          />
        )}
      </SlideUpModal>
    </div>
  );
}

/* ========================================================================== */
/*  Orders List (pipeline)                                                    */
/* ========================================================================== */

function OrdersList({
  orders,
  isLoading,
  tab,
  onSelect,
}: {
  orders: PlantOrder[];
  isLoading: boolean;
  tab: TabKey;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-sage text-center py-10">Loading...</p>;
  }
  if (orders.length === 0) {
    return (
      <p className="text-sm text-stone text-center py-10">
        {tab === "follow_ups" ? "No follow-ups due." : "No plant orders here."}
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block bg-offwhite rounded-2xl border border-stone/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone bg-cream/50 text-left text-sage">
              <th className="py-2.5 px-4 font-medium">Customer</th>
              <th className="py-2.5 px-3 font-medium">Society</th>
              <th className="py-2.5 px-3 font-medium">Plants</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              <th className="py-2.5 px-3 font-medium">Follow-up</th>
              <th className="py-2.5 px-3 font-medium">Install due</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-stone/30 last:border-0 hover:bg-cream/40 cursor-pointer transition-colors"
                onClick={() => onSelect(order.id)}
              >
                <td className="py-3 px-4 text-charcoal font-medium">
                  {order.customer_name ?? "Unknown"}
                </td>
                <td className="py-3 px-3 text-sage">{order.society_name ?? "—"}</td>
                <td className="py-3 px-3 text-charcoal">
                  {order.items_summary ? truncate(order.items_summary, 36) : "—"}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[order.status] ?? "bg-stone/20 text-charcoal"}`}
                  >
                    {PLANT_ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </td>
                <td className={`py-3 px-3 ${followUpClass(order.next_follow_up_at)}`}>
                  {order.next_follow_up_at ? formatDate(order.next_follow_up_at) : "—"}
                </td>
                <td className="py-3 px-3 text-charcoal">
                  {order.due_date ? formatDate(order.due_date) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2 cursor-pointer active:bg-cream/60 transition-colors"
            onClick={() => onSelect(order.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-charcoal text-sm">
                  {order.customer_name ?? "Unknown"}
                </p>
                {order.society_name && (
                  <p className="text-xs text-sage mt-0.5">{order.society_name}</p>
                )}
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[order.status] ?? "bg-stone/20 text-charcoal"}`}
              >
                {PLANT_ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>

            {order.items_summary && (
              <p className="text-xs text-charcoal line-clamp-2">{order.items_summary}</p>
            )}

            <div className="flex items-center justify-between border-t border-stone/30 pt-2">
              <span className={`text-xs ${followUpClass(order.next_follow_up_at)}`}>
                {order.next_follow_up_at
                  ? `Follow up: ${formatDate(order.next_follow_up_at)}`
                  : order.due_date
                    ? `Install due: ${formatDate(order.due_date)}`
                    : "No follow-up set"}
              </span>
              <ChevronRight size={14} className="text-stone" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ========================================================================== */
/*  Create Order Form (front of funnel — items optional)                      */
/* ========================================================================== */

function CreateOrderForm({
  customers,
  onSuccess,
}: {
  customers: Customer[];
  onSuccess: (info: {
    id: string;
    customerName: string;
    items: { plant_name: string; quantity: number }[];
  }) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [plantRows, setPlantRows] = useState<PlantRow[]>([
    { key: nextRowKey(), plant: null, quantity: 1, note: "" },
  ]);
  const [followUpAt, setFollowUpAt] = useState("");
  const [stage, setStage] = useState<PlantOrderStatus>("interested");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // An order can be created at `interested` with zero plants (FD-10).
  const canSubmit = !!customerId && !submitting;

  function addRow() {
    setPlantRows((prev) => [...prev, { key: nextRowKey(), plant: null, quantity: 1, note: "" }]);
  }
  function removeRow(key: number) {
    setPlantRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function updateRow(key: number, updates: Partial<PlantRow>) {
    setPlantRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const validItems = plantRows
      .filter((r) => r.plant !== null)
      .map((r) => ({
        plant_id: r.plant!.plant_id ?? undefined,
        plant_name: r.plant!.plant_name,
        quantity: r.quantity,
        note: r.note || undefined,
      }));

    try {
      const res = await fetch("/api/ops/plant-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          items: validItems,
          status: stage,
          next_follow_up_at: followUpAt || undefined,
          notes: notes || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to create order.");
        setSubmitting(false);
        return;
      }

      const selectedCustomer = customers.find((c) => c.id === customerId);
      onSuccess({
        id: json.data?.id ?? "",
        customerName: selectedCustomer?.name ?? "Customer",
        items: validItems.map((i) => ({ plant_name: i.plant_name, quantity: i.quantity })),
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-sage mb-1">Customer *</label>
        <select className={INPUT_CLS} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select a customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.societies?.name ? ` (${c.societies.name})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-sage mb-1">
          Stage <span className="text-terra">*</span>
        </label>
        <select
          className={INPUT_CLS}
          value={stage}
          onChange={(e) => setStage(e.target.value as PlantOrderStatus)}
        >
          {CREATABLE_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PLANT_ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-sage mt-1">
          Where this is in the pipeline. “Confirmed” needs at least one plant.
        </p>
      </div>

      <div>
        <label className="block text-xs text-sage mb-1">
          Plants <span className="text-stone">(optional — add later as it firms up)</span>
        </label>
        <div className="space-y-3">
          {plantRows.map((row) => (
            <div key={row.key} className="bg-cream rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <PlantSelector value={row.plant} onChange={(p) => updateRow(row.key, { plant: p })} />
                </div>
                {plantRows.length > 1 && (
                  <button onClick={() => removeRow(row.key)} className="mt-2.5 p-1 text-stone hover:text-terra">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex items-center border border-stone rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateRow(row.key, { quantity: Math.max(1, row.quantity - 1) })}
                    className="w-10 h-10 flex items-center justify-center text-lg text-charcoal hover:bg-cream active:bg-stone/20"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-medium text-charcoal">{row.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateRow(row.key, { quantity: row.quantity + 1 })}
                    className="w-10 h-10 flex items-center justify-center text-lg text-charcoal hover:bg-cream active:bg-stone/20"
                  >
                    +
                  </button>
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    className={INPUT_CLS}
                    placeholder="Note (optional)"
                    value={row.note}
                    onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="mt-2 flex items-center gap-1 text-xs text-forest hover:text-garden font-medium">
          <Plus size={14} />
          Add a plant
        </button>
      </div>

      <div>
        <label className="block text-xs text-sage mb-1">
          Remind me on <span className="text-stone">(optional)</span>
        </label>
        <input type="date" className={INPUT_CLS} value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
        <p className="text-[11px] text-sage mt-1">Sets a follow-up so this doesn&apos;t slip through the cracks.</p>
      </div>

      <div>
        <label className="block text-xs text-sage mb-1">
          Notes <span className="text-stone">(optional)</span>
        </label>
        <textarea
          className={INPUT_CLS}
          rows={3}
          placeholder="Context, timing (e.g. wants install next week), anything useful…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-terra bg-terra/10 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "Creating..." : "Create Order"}
      </button>
    </div>
  );
}

/* ========================================================================== */
/*  Created Order Draft                                                       */
/* ========================================================================== */

function CreatedOrderDraft({
  order,
  onClose,
}: {
  order: {
    id: string;
    customerName: string;
    items: { plant_name: string; quantity: number }[];
  };
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="bg-forest/10 rounded-xl p-4">
        <p className="text-sm text-forest font-medium mb-1">Order created</p>
        <p className="text-xs text-charcoal">
          {order.items.length > 0
            ? `${order.items.map((i) => `${i.plant_name} x${i.quantity}`).join(", ")} for ${order.customerName}`
            : `Interest logged for ${order.customerName} — no plants chosen yet.`}
        </p>
      </div>

      {order.id && (
        <button
          onClick={() => router.push(`/ops/plant-orders/${order.id}`)}
          className="w-full py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden transition-colors"
        >
          View Order
        </button>
      )}

      <button
        onClick={onClose}
        className="w-full py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors"
      >
        Close
      </button>
    </div>
  );
}
