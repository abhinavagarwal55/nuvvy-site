"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDate } from "@/lib/utils/format-date";
import {
  Plus,
  X,
  ArrowLeft,
  Sprout,
  Truck,
  ChevronRight,
  Loader2,
  Pencil,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import PlantSelector from "@/components/ops/PlantSelector";
import WhatsAppDraftButton from "@/components/ops/WhatsAppDraftButton";

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

type PlantOrder = {
  id: string;
  customer_id: string;
  status: string;
  request_source: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  society_name: string | null;
  item_count: number;
  items_summary: string;
};

type OrderItem = {
  id: string;
  plant_order_id: string;
  plant_id: string | null;
  plant_name: string;
  quantity: number;
  note: string | null;
  status: string;
  created_at: string;
};

type OrderDetail = {
  id: string;
  customer_id: string;
  status: string;
  request_source: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer: {
    id: string;
    name: string;
    phone_number: string | null;
    address: string | null;
    society_id: string | null;
    society_name: string | null;
  } | null;
  items: OrderItem[];
};

type NurseryTrip = {
  id: string;
  trip_date: string;
  nursery_name: string | null;
  status: string;
  notes: string | null;
  item_count: number;
  created_at: string;
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

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "trip_assigned", label: "Trip Assigned" },
  { value: "procured", label: "Procured" },
  { value: "installed", label: "Installed" },
];

const ORDER_STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  requested: { cls: "bg-stone/20 text-charcoal", label: "Requested" },
  trip_assigned: { cls: "bg-blue-50 text-blue-700", label: "Trip Assigned" },
  procured: { cls: "bg-forest/10 text-forest", label: "Procured" },
  installed: { cls: "bg-forest text-offwhite", label: "Installed" },
  cancelled: { cls: "bg-stone/20 text-sage line-through", label: "Cancelled" },
};

const ITEM_STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  requested: { cls: "bg-stone/20 text-charcoal", label: "Requested" },
  trip_assigned: { cls: "bg-blue-50 text-blue-700", label: "Trip Assigned" },
  procured: { cls: "bg-forest/10 text-forest", label: "Procured" },
  installed: { cls: "bg-forest text-offwhite", label: "Installed" },
  cancelled: { cls: "bg-stone/20 text-sage", label: "Cancelled" },
};

const TRIP_STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  planned: { cls: "bg-blue-50 text-blue-700", label: "Planned" },
  completed: { cls: "bg-forest/10 text-forest", label: "Completed" },
  cancelled: { cls: "bg-stone/20 text-sage", label: "Cancelled" },
};

const REQUEST_SOURCE_OPTIONS = [
  { value: "customer_requested", label: "Customer Requested" },
  { value: "replacement", label: "Replacement" },
];

const TERMINAL_STATUSES = new Set(["cancelled", "installed"]);

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

let rowKeyCounter = 0;
function nextRowKey() {
  return ++rowKeyCounter;
}

/* ========================================================================== */
/*  Helpers                                                                   */
/* ========================================================================== */

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getStartOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getEndOfWeek(d: Date): Date {
  const start = getStartOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

function defaultDueDate(): string {
  return toDateString(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
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
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-sage hover:text-charcoal"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Page Component                                                            */
/* ========================================================================== */

export default function PlantOrdersPage() {
  const router = useRouter();
  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<"orders" | "trips">("orders");

  // --- Orders state ---
  const [viewMode, setViewMode] = useState<"active" | "cancelled">("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [overdueActive, setOverdueActive] = useState(false);
  const [dueThisWeekActive, setDueThisWeekActive] = useState(false);

  // --- Detail modal ---
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // --- Create order modal ---
  const [createOpen, setCreateOpen] = useState(false);

  // --- Edit order modal ---
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  // --- Cancel order ---
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // --- Create trip modal ---
  const [createTripOpen, setCreateTripOpen] = useState(false);

  // --- Trips filter ---
  const [tripStatusFilter, setTripStatusFilter] = useState("all");

  // --- Success state (after create) ---
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    customerName: string;
    customerPhone: string;
    dueDate: string;
    items: { plant_name: string; quantity: number }[];
  } | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Orders API                                                        */
  /* ------------------------------------------------------------------ */

  const ordersApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (viewMode === "cancelled") {
      params.set("status", "cancelled");
    } else {
      if (statusFilter !== "all") params.set("status", statusFilter);
    }
    if (overdueActive && viewMode === "active") params.set("overdue", "true");
    if (dueThisWeekActive && viewMode === "active") {
      const now = new Date();
      params.set("due_after", toDateString(getStartOfWeek(now)));
      params.set("due_before", toDateString(getEndOfWeek(now)));
    }
    const qs = params.toString();
    return `/api/ops/plant-orders${qs ? `?${qs}` : ""}`;
  }, [viewMode, statusFilter, overdueActive, dueThisWeekActive]);

  const {
    data: ordersData,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useSWR<{ data: PlantOrder[] }>(
    activeTab === "orders" ? ordersApiUrl : null,
    fetcher
  );
  const rawOrders = ordersData?.data ?? [];
  // Filter cancelled from active view (server may return all when status=all)
  const orders = viewMode === "active"
    ? rawOrders.filter((o) => o.status !== "cancelled")
    : rawOrders;

  /* ------------------------------------------------------------------ */
  /*  Order detail API                                                  */
  /* ------------------------------------------------------------------ */

  const {
    data: detailData,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<{ data: OrderDetail }>(
    selectedOrderId ? `/api/ops/plant-orders/${selectedOrderId}` : null,
    fetcher
  );
  const orderDetail = detailData?.data ?? null;

  /* ------------------------------------------------------------------ */
  /*  Trips API                                                         */
  /* ------------------------------------------------------------------ */

  const tripsApiUrl = useMemo(() => {
    if (tripStatusFilter === "all") return "/api/ops/nursery-trips";
    return `/api/ops/nursery-trips?status=${tripStatusFilter}`;
  }, [tripStatusFilter]);

  const {
    data: tripsData,
    isLoading: tripsLoading,
    mutate: mutateTrips,
  } = useSWR<{ data: NurseryTrip[] }>(
    activeTab === "trips" ? tripsApiUrl : null,
    fetcher
  );
  const trips = tripsData?.data ?? [];

  /* ------------------------------------------------------------------ */
  /*  Customers API (for create form)                                   */
  /* ------------------------------------------------------------------ */

  const { data: customersData } = useSWR<{ data: Customer[] }>(
    createOpen || editOrderId ? "/api/ops/customers?status=ACTIVE" : null,
    fetcher
  );
  const customers = customersData?.data ?? [];

  /* ------------------------------------------------------------------ */
  /*  Due date helpers                                                  */
  /* ------------------------------------------------------------------ */

  const today = toDateString(new Date());
  const threeDaysFromNow = toDateString(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  );

  function dueDateClass(order: PlantOrder): string {
    if (!order.due_date || TERMINAL_STATUSES.has(order.status)) return "";
    if (order.due_date < today) return "text-terra";
    if (order.due_date <= threeDaysFromNow) return "text-amber-700";
    return "";
  }

  /* ------------------------------------------------------------------ */
  /*  Cancel order handler                                              */
  /* ------------------------------------------------------------------ */

  const handleCancelOrder = useCallback(async () => {
    if (!cancelOrderId || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/ops/plant-orders/${cancelOrderId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cancellation_reason: cancelReason.trim(),
          }),
        }
      );
      if (res.ok) {
        setCancelOrderId(null);
        setCancelReason("");
        setSelectedOrderId(null);
        mutateOrders();
      }
    } finally {
      setCancelling(false);
    }
  }, [cancelOrderId, cancelReason, mutateOrders]);

  /* ------------------------------------------------------------------ */
  /*  Styling helpers                                                   */
  /* ------------------------------------------------------------------ */

  const tabPillCls = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors flex items-center gap-1.5 ${
      active
        ? "bg-forest text-offwhite border-forest"
        : "bg-offwhite text-charcoal border-stone hover:bg-cream"
    }`;

  const filterPillCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
      active
        ? "bg-forest text-offwhite border-forest"
        : "bg-cream text-charcoal border-stone"
    }`;

  const selectCls =
    "px-3 py-1.5 border border-stone rounded-xl text-xs text-charcoal bg-offwhite focus:outline-none focus:border-forest";

  /* ================================================================== */
  /*  RENDER                                                            */
  /* ================================================================== */

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* ---- Sticky header ---- */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            Plant Orders
          </h1>

          {/* Create button — context-aware */}
          {activeTab === "orders" ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
            >
              <Plus size={14} />
              New Order
            </button>
          ) : (
            <button
              onClick={() => setCreateTripOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
            >
              <Plus size={14} />
              New Trip
            </button>
          )}
        </div>

        {/* Tab pills */}
        <div className="flex items-center gap-2 mb-3">
          <button
            className={tabPillCls(activeTab === "orders")}
            onClick={() => setActiveTab("orders")}
          >
            <Sprout size={14} />
            Orders
          </button>
          <button
            className={tabPillCls(activeTab === "trips")}
            onClick={() => setActiveTab("trips")}
          >
            <Truck size={14} />
            Nursery Trips
          </button>
        </div>

        {/* Filters — orders tab */}
        {activeTab === "orders" && (
          <div className="space-y-2">
            {/* Active / Cancelled toggle */}
            <div className="flex items-center gap-2">
              <button
                className={filterPillCls(viewMode === "active")}
                onClick={() => setViewMode("active")}
              >
                Active
              </button>
              <button
                className={filterPillCls(viewMode === "cancelled")}
                onClick={() => setViewMode("cancelled")}
              >
                Cancelled
              </button>
            </div>

            {/* Status + quick filters (only in active view) */}
            {viewMode === "active" && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={selectCls}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {ORDER_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  className={filterPillCls(overdueActive)}
                  onClick={() => setOverdueActive((v) => !v)}
                >
                  Overdue
                </button>
                <button
                  className={filterPillCls(dueThisWeekActive)}
                  onClick={() => setDueThisWeekActive((v) => !v)}
                >
                  Due This Week
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filters — trips tab */}
        {activeTab === "trips" && (
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: "all", label: "All" },
              { value: "planned", label: "Planned" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ].map((f) => (
              <button
                key={f.value}
                className={filterPillCls(tripStatusFilter === f.value)}
                onClick={() => setTripStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- Content ---- */}
      <div className="px-4 pt-4">
        {activeTab === "orders" && (
          <OrdersList
            orders={orders}
            isLoading={ordersLoading}
            dueDateClass={dueDateClass}
            onSelect={(id) => router.push(`/ops/plant-orders/${id}`)}
          />
        )}

        {activeTab === "trips" && (
          <TripsList trips={trips} isLoading={tripsLoading} />
        )}
      </div>

      {/* ---- Order Detail Modal ---- */}
      <SlideUpModal
        open={!!selectedOrderId && !editOrderId && !cancelOrderId}
        onClose={() => setSelectedOrderId(null)}
        title="Order Detail"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-sage" />
          </div>
        ) : orderDetail ? (
          <OrderDetailView
            order={orderDetail}
            onEdit={() => setEditOrderId(orderDetail.id)}
            onCancel={() => setCancelOrderId(orderDetail.id)}
            onClose={() => setSelectedOrderId(null)}
          />
        ) : (
          <p className="text-sm text-sage text-center py-6">
            Order not found.
          </p>
        )}
      </SlideUpModal>

      {/* ---- Cancel Order Modal ---- */}
      <SlideUpModal
        open={!!cancelOrderId}
        onClose={() => {
          setCancelOrderId(null);
          setCancelReason("");
        }}
        title="Cancel Order"
      >
        <div className="space-y-3">
          <p className="text-sm text-charcoal">
            Are you sure you want to cancel this order? This cannot be undone.
          </p>
          <div>
            <label className="block text-xs text-sage mb-1">
              Cancellation Reason *
            </label>
            <textarea
              className={INPUT_CLS}
              rows={3}
              placeholder="Why is this order being cancelled?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCancelOrderId(null);
                setCancelReason("");
              }}
              className="flex-1 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={handleCancelOrder}
              disabled={!cancelReason.trim() || cancelling}
              className="flex-1 py-2.5 bg-terra text-offwhite text-sm font-medium rounded-xl hover:bg-terra/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {cancelling && <Loader2 size={16} className="animate-spin" />}
              {cancelling ? "Cancelling..." : "Cancel Order"}
            </button>
          </div>
        </div>
      </SlideUpModal>

      {/* ---- Create Order Modal ---- */}
      <SlideUpModal
        open={createOpen && !createdOrder}
        onClose={() => setCreateOpen(false)}
        title="New Plant Order"
      >
        <CreateOrderForm
          customers={customers}
          onSuccess={(info) => {
            setCreatedOrder(info);
            mutateOrders();
          }}
          onClose={() => setCreateOpen(false)}
        />
      </SlideUpModal>

      {/* ---- WhatsApp Success View ---- */}
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

      {/* ---- Edit Order Modal ---- */}
      <SlideUpModal
        open={!!editOrderId}
        onClose={() => setEditOrderId(null)}
        title="Edit Order"
      >
        {editOrderId && orderDetail && (
          <EditOrderForm
            order={orderDetail}
            onSuccess={() => {
              setEditOrderId(null);
              mutateDetail();
              mutateOrders();
            }}
            onClose={() => setEditOrderId(null)}
          />
        )}
      </SlideUpModal>

      {/* ---- Create Trip Modal ---- */}
      <SlideUpModal
        open={createTripOpen}
        onClose={() => setCreateTripOpen(false)}
        title="New Nursery Trip"
      >
        <CreateTripForm
          onSuccess={() => {
            setCreateTripOpen(false);
            mutateTrips();
          }}
          onClose={() => setCreateTripOpen(false)}
        />
      </SlideUpModal>
    </div>
  );
}

/* ========================================================================== */
/*  Orders List                                                               */
/* ========================================================================== */

function OrdersList({
  orders,
  isLoading,
  dueDateClass,
  onSelect,
}: {
  orders: PlantOrder[];
  isLoading: boolean;
  dueDateClass: (order: PlantOrder) => string;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-sage text-center py-10">Loading...</p>;
  }

  if (orders.length === 0) {
    return (
      <p className="text-sm text-stone text-center py-10">
        No plant orders found.
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
              <th className="py-2.5 px-3 font-medium">Due Date</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              <th className="py-2.5 px-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const badge = ORDER_STATUS_BADGE[order.status] ?? {
                cls: "bg-stone/20 text-charcoal",
                label: order.status,
              };
              return (
                <tr
                  key={order.id}
                  className="border-b border-stone/30 last:border-0 hover:bg-cream/40 cursor-pointer transition-colors"
                  onClick={() => onSelect(order.id)}
                >
                  <td className="py-3 px-4 text-charcoal font-medium">
                    {order.customer_name ?? "Unknown"}
                  </td>
                  <td className="py-3 px-3 text-sage">
                    {order.society_name ?? "\u2014"}
                  </td>
                  <td className="py-3 px-3 text-charcoal">
                    {order.items_summary
                      ? truncate(order.items_summary, 40)
                      : "\u2014"}
                  </td>
                  <td
                    className={`py-3 px-3 ${dueDateClass(order) || "text-charcoal"}`}
                  >
                    {order.due_date ? formatDate(order.due_date) : "\u2014"}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-sage">
                    {formatDate(order.created_at.split("T")[0])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {orders.map((order) => {
          const badge = ORDER_STATUS_BADGE[order.status] ?? {
            cls: "bg-stone/20 text-charcoal",
            label: order.status,
          };
          return (
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
                    <p className="text-xs text-sage mt-0.5">
                      {order.society_name}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>

              {order.items_summary && (
                <p className="text-xs text-charcoal line-clamp-2">
                  {order.items_summary}
                </p>
              )}

              <div className="flex items-center justify-between border-t border-stone/30 pt-2">
                <span
                  className={`text-xs ${dueDateClass(order) || "text-sage"}`}
                >
                  {order.due_date
                    ? `Due: ${formatDate(order.due_date)}`
                    : "No due date"}
                </span>
                <ChevronRight size={14} className="text-stone" />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ========================================================================== */
/*  Order Detail View                                                         */
/* ========================================================================== */

function OrderDetailView({
  order,
  onEdit,
  onCancel,
  onClose,
}: {
  order: OrderDetail;
  onEdit: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const badge = ORDER_STATUS_BADGE[order.status] ?? {
    cls: "bg-stone/20 text-charcoal",
    label: order.status,
  };

  return (
    <div className="space-y-4">
      {/* Customer info */}
      <div className="bg-cream rounded-xl p-3 space-y-1">
        <p className="text-sm text-charcoal font-medium">
          {order.customer?.name ?? "Unknown Customer"}
        </p>
        {order.customer?.society_name && (
          <p className="text-xs text-sage">{order.customer.society_name}</p>
        )}
        {order.customer?.address && (
          <p className="text-xs text-stone">{order.customer.address}</p>
        )}
      </div>

      {/* Status + dates */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
        {order.due_date && (
          <span className="text-xs text-charcoal">
            Due: {formatDate(order.due_date)}
          </span>
        )}
        <span className="text-xs text-sage">
          Created: {formatDate(order.created_at.split("T")[0])}
        </span>
      </div>

      {/* Source */}
      <div>
        <p className="text-xs text-sage mb-0.5">Source</p>
        <p className="text-sm text-charcoal capitalize">
          {order.request_source?.replace("_", " ") ?? "\u2014"}
        </p>
      </div>

      {/* Notes */}
      {order.notes && (
        <div>
          <p className="text-xs text-sage mb-0.5">Notes</p>
          <p className="text-sm text-charcoal whitespace-pre-wrap">
            {order.notes}
          </p>
        </div>
      )}

      {/* Items */}
      <div>
        <p className="text-xs text-sage mb-2">
          Items ({order.items.length})
        </p>
        <div className="space-y-2">
          {order.items.map((item) => {
            const itemBadge = ITEM_STATUS_BADGE[item.status] ?? {
              cls: "bg-stone/20 text-charcoal",
              label: item.status,
            };
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5"
              >
                {/* Plant icon placeholder */}
                <div className="w-9 h-9 rounded-lg bg-forest/10 flex items-center justify-center flex-shrink-0">
                  <Sprout size={16} className="text-forest" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-charcoal font-medium truncate">
                      {item.plant_name}
                    </p>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${itemBadge.cls}`}
                    >
                      {itemBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-sage">
                      Qty: {item.quantity}
                    </span>
                    {item.note && (
                      <span className="text-xs text-stone truncate">
                        {item.note}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t border-stone/30">
        {order.status === "requested" && (
          <button
            onClick={onEdit}
            className="flex-1 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {!TERMINAL_STATUSES.has(order.status) && (
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-terra/40 text-terra text-sm font-medium rounded-xl hover:bg-terra/5 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={14} />
            Cancel Order
          </button>
        )}
        {order.customer?.phone_number && (
          <a
            href={`https://wa.me/${order.customer.phone_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hi! Here's an update on your plant order from Nuvvy.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-[#25D366] text-white text-sm font-medium rounded-xl hover:bg-[#20BD5A] transition-colors text-center"
          >
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Create Order Form                                                         */
/* ========================================================================== */

function CreateOrderForm({
  customers,
  onSuccess,
  onClose,
}: {
  customers: Customer[];
  onSuccess: (info: {
    id: string;
    customerName: string;
    customerPhone: string;
    dueDate: string;
    items: { plant_name: string; quantity: number }[];
  }) => void;
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [plantRows, setPlantRows] = useState<PlantRow[]>([
    { key: nextRowKey(), plant: null, quantity: 1, note: "" },
  ]);
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [requestSource, setRequestSource] = useState("customer_requested");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    customerId && plantRows.some((r) => r.plant !== null) && !submitting;

  function addRow() {
    setPlantRows((prev) => [
      ...prev,
      { key: nextRowKey(), plant: null, quantity: 1, note: "" },
    ]);
  }

  function removeRow(key: number) {
    setPlantRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function updateRow(key: number, updates: Partial<PlantRow>) {
    setPlantRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...updates } : r))
    );
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

    if (validItems.length === 0) {
      setError("Add at least one plant.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/ops/plant-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          items: validItems,
          due_date: dueDate || undefined,
          request_source: requestSource,
          notes: notes || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to create order.");
        setSubmitting(false);
        return;
      }

      const selectedCustomer = customers.find((c) => c.id === customerId);
      onSuccess({
        id: json.data?.id ?? "",
        customerName: selectedCustomer?.name ?? "Customer",
        customerPhone: selectedCustomer?.phone_number ?? "",
        dueDate: dueDate,
        items: validItems.map((i) => ({
          plant_name: i.plant_name,
          quantity: i.quantity,
        })),
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Customer selector */}
      <div>
        <label className="block text-xs text-sage mb-1">Customer *</label>
        <select
          className={INPUT_CLS}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Select a customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.societies?.name ? ` (${c.societies.name})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Plant rows */}
      <div>
        <label className="block text-xs text-sage mb-1">Plants *</label>
        <div className="space-y-3">
          {plantRows.map((row, idx) => (
            <div
              key={row.key}
              className="bg-cream rounded-xl p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <PlantSelector
                    value={row.plant}
                    onChange={(p) => updateRow(row.key, { plant: p })}
                  />
                </div>
                {plantRows.length > 1 && (
                  <button
                    onClick={() => removeRow(row.key)}
                    className="mt-2.5 p-1 text-stone hover:text-terra"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-end">
                <div>
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
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    className={INPUT_CLS}
                    placeholder="Note (optional)"
                    value={row.note}
                    onChange={(e) =>
                      updateRow(row.key, { note: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addRow}
          className="mt-2 flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
        >
          <Plus size={14} />
          Add another plant
        </button>
      </div>

      {/* Due date */}
      <div>
        <label className="block text-xs text-sage mb-1">Due Date</label>
        <input
          type="date"
          className={INPUT_CLS}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {/* Request source */}
      <div>
        <label className="block text-xs text-sage mb-1">Request Source</label>
        <select
          className={INPUT_CLS}
          value={requestSource}
          onChange={(e) => setRequestSource(e.target.value)}
        >
          {REQUEST_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-sage mb-1">Notes</label>
        <textarea
          className={INPUT_CLS}
          rows={3}
          placeholder="Any additional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-terra bg-terra/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
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
/*  Edit Order Form                                                           */
/* ========================================================================== */

function EditOrderForm({
  order,
  onSuccess,
  onClose,
}: {
  order: OrderDetail;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [plantRows, setPlantRows] = useState<PlantRow[]>(() =>
    order.items.map((item) => ({
      key: nextRowKey(),
      plant: {
        plant_id: item.plant_id,
        plant_name: item.plant_name,
        price_band: null,
      },
      quantity: item.quantity,
      note: item.note ?? "",
    }))
  );
  const [dueDate, setDueDate] = useState(order.due_date ?? "");
  const [requestSource, setRequestSource] = useState(
    order.request_source ?? "customer_requested"
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = plantRows.some((r) => r.plant !== null) && !submitting;

  function addRow() {
    setPlantRows((prev) => [
      ...prev,
      { key: nextRowKey(), plant: null, quantity: 1, note: "" },
    ]);
  }

  function removeRow(key: number) {
    setPlantRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function updateRow(key: number, updates: Partial<PlantRow>) {
    setPlantRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...updates } : r))
    );
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

    if (validItems.length === 0) {
      setError("Add at least one plant.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/ops/plant-orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validItems,
          due_date: dueDate || undefined,
          request_source: requestSource,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to update order.");
        setSubmitting(false);
        return;
      }

      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Customer (read-only) */}
      <div className="bg-cream rounded-xl p-3">
        <p className="text-xs text-sage mb-0.5">Customer</p>
        <p className="text-sm text-charcoal font-medium">
          {order.customer?.name ?? "Unknown"}
          {order.customer?.society_name
            ? ` (${order.customer.society_name})`
            : ""}
        </p>
      </div>

      {/* Plant rows */}
      <div>
        <label className="block text-xs text-sage mb-1">Plants *</label>
        <div className="space-y-3">
          {plantRows.map((row) => (
            <div
              key={row.key}
              className="bg-cream rounded-xl p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <PlantSelector
                    value={row.plant}
                    onChange={(p) => updateRow(row.key, { plant: p })}
                  />
                </div>
                {plantRows.length > 1 && (
                  <button
                    onClick={() => removeRow(row.key)}
                    className="mt-2.5 p-1 text-stone hover:text-terra"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-end">
                <div>
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
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    className={INPUT_CLS}
                    placeholder="Note (optional)"
                    value={row.note}
                    onChange={(e) =>
                      updateRow(row.key, { note: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addRow}
          className="mt-2 flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
        >
          <Plus size={14} />
          Add another plant
        </button>
      </div>

      {/* Due date */}
      <div>
        <label className="block text-xs text-sage mb-1">Due Date</label>
        <input
          type="date"
          className={INPUT_CLS}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {/* Request source */}
      <div>
        <label className="block text-xs text-sage mb-1">Request Source</label>
        <select
          className={INPUT_CLS}
          value={requestSource}
          onChange={(e) => setRequestSource(e.target.value)}
        >
          {REQUEST_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-sage mb-1">Notes</label>
        <textarea
          className={INPUT_CLS}
          rows={3}
          placeholder="Any additional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-terra bg-terra/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Trips List                                                                */
/* ========================================================================== */

function TripsList({
  trips,
  isLoading,
}: {
  trips: NurseryTrip[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-sage text-center py-10">Loading...</p>;
  }

  if (trips.length === 0) {
    return (
      <p className="text-sm text-stone text-center py-10">
        No nursery trips found.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {trips.map((trip) => {
        const badge = TRIP_STATUS_BADGE[trip.status] ?? {
          cls: "bg-stone/20 text-charcoal",
          label: trip.status,
        };
        return (
          <a
            key={trip.id}
            href={`/ops/nursery-trips/${trip.id}`}
            className="block bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2 cursor-pointer active:bg-cream/60 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-charcoal text-sm">
                  {formatDate(trip.trip_date)}
                </p>
                {trip.nursery_name && (
                  <p className="text-xs text-sage mt-0.5">
                    {trip.nursery_name}
                  </p>
                )}
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-stone/30 pt-2">
              <span className="text-xs text-sage">
                {trip.item_count} {trip.item_count === 1 ? "item" : "items"}
              </span>
              <ChevronRight size={14} className="text-stone" />
            </div>
          </a>
        );
      })}
    </div>
  );
}

/* ========================================================================== */
/*  Create Trip Form                                                          */
/* ========================================================================== */

function CreateTripForm({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [tripDate, setTripDate] = useState("");
  const [nurseryName, setNurseryName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!tripDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/nursery-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_date: tripDate,
          nursery_name: nurseryName || undefined,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-sage mb-1">Trip Date *</label>
        <input
          type="date"
          className={INPUT_CLS}
          value={tripDate}
          onChange={(e) => setTripDate(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">Nursery Name</label>
        <input
          type="text"
          className={INPUT_CLS}
          placeholder="e.g. Green Paradise Nursery"
          value={nurseryName}
          onChange={(e) => setNurseryName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs text-sage mb-1">Notes</label>
        <textarea
          className={INPUT_CLS}
          rows={3}
          placeholder="Any notes for this trip..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!tripDate || submitting}
          className="flex-1 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? "Creating..." : "Create Trip"}
        </button>
      </div>
    </div>
  );
}

// ─── Created Order Draft ─────────────────────────────────────────────────────

function CreatedOrderDraft({
  order,
  onClose,
}: {
  order: {
    id: string;
    customerName: string;
    customerPhone: string;
    dueDate: string;
    items: { plant_name: string; quantity: number }[];
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const msg = `Hi ${order.customerName},\n\nWe've noted your plant request for:\n\n${order.items.map((i) => `- ${i.quantity}x ${i.plant_name}`).join("\n")}\n\nWe'll source these and aim to install them by ${formatDate(order.dueDate)}.\n\nWe'll keep you updated once the plants are procured.\n\n– Team Nuvvy`;

  const cleanPhone = order.customerPhone.replace(/[^0-9]/g, "");
  const waLink = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : null;

  return (
    <div className="space-y-4">
      <div className="bg-forest/10 rounded-xl p-4">
        <p className="text-sm text-forest font-medium mb-1">Order created successfully</p>
        <p className="text-xs text-charcoal">
          {order.items.map((i) => `${i.plant_name} x${i.quantity}`).join(", ")} for {order.customerName}
        </p>
      </div>

      {/* Draft message */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Acknowledgement Message</p>
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
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#20BD5A] transition-colors"
          >
            Open in WhatsApp
          </a>
        )}
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
