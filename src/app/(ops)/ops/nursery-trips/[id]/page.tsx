"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Check, X, Loader2, Sprout, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

/* ---------- Types ---------- */

type TripItem = {
  id: string;
  plant_name: string;
  quantity: number;
  qty_procured: number | null;
  actual_unit_price: number | null;
  status: string;
  note: string | null;
  due_date: string | null;
  order_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  procurement_date: string | null;
  nursery_name: string | null;
  thumbnail_url: string | null;
  price_band: string | null;
};

type Trip = {
  id: string;
  trip_date: string;
  nursery_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  items: TripItem[];
};

type RequestedItem = {
  id: string;
  plant_name: string;
  quantity: number;
  note: string | null;
  due_date: string | null;
  customer_name: string | null;
  order_id: string | null;
};

/* ---------- Constants ---------- */

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  planned: { cls: "bg-blue-50 text-blue-700", label: "Planned" },
  completed: { cls: "bg-forest/10 text-forest", label: "Completed" },
  cancelled: { cls: "bg-stone/20 text-sage", label: "Cancelled" },
};

const ITEM_STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  requested: { cls: "bg-stone/20 text-charcoal", label: "Requested" },
  trip_assigned: { cls: "bg-blue-50 text-blue-700", label: "Assigned" },
  procured: { cls: "bg-forest/10 text-forest", label: "Procured" },
  installed: { cls: "bg-forest text-offwhite", label: "Installed" },
  cancelled: { cls: "bg-stone/20 text-sage line-through", label: "Cancelled" },
};

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

/* ---------- Slide-up modal ---------- */

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
      <div className="relative w-full max-w-lg bg-offwhite rounded-t-2xl p-5 pb-8 mb-16 animate-slide-up max-h-[80vh] overflow-y-auto">
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

/* ---------- Consolidated Procurement ---------- */

type PlantProcureState = {
  qtyProcured: number;
  unitPrice: string;
  allocations: Record<string, number>; // itemId -> allocated qty
};

type ConsolidatedRow = {
  plant_name: string;
  total_qty: number;
  total_procured: number;
  thumbnail_url: string | null;
  price_band: string | null;
  items: TripItem[];
};

function ConsolidatedProcurement({
  rows,
  tripNurseryName,
  onSaved,
}: {
  rows: ConsolidatedRow[];
  tripNurseryName: string | null;
  onSaved: () => void;
}) {
  const [state, setState] = useState<Record<string, PlantProcureState>>(() => {
    const init: Record<string, PlantProcureState> = {};
    for (const row of rows) {
      const procurableItems = row.items.filter(
        (i) => i.status === "trip_assigned" || i.status === "procured"
      );
      if (procurableItems.length === 0) continue;

      // Check if already procured (pre-fill)
      const alreadyProcured = procurableItems.every((i) => i.status === "procured");
      const totalNeeded = procurableItems.reduce((s, i) => s + i.quantity, 0);

      init[row.plant_name] = {
        qtyProcured: alreadyProcured
          ? procurableItems.reduce((s, i) => s + (i.qty_procured ?? 0), 0)
          : totalNeeded,
        unitPrice: alreadyProcured && procurableItems[0].actual_unit_price != null
          ? String(procurableItems[0].actual_unit_price)
          : "",
        allocations: Object.fromEntries(
          procurableItems.map((i) => [
            i.id,
            alreadyProcured ? (i.qty_procured ?? i.quantity) : i.quantity,
          ])
        ),
      };
    }
    return init;
  });

  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPlants, setSavedPlants] = useState<Set<string>>(new Set());

  function toggleExpand(plantName: string) {
    setExpandedPlants((prev) => {
      const next = new Set(prev);
      if (next.has(plantName)) next.delete(plantName);
      else next.add(plantName);
      return next;
    });
  }

  function updateQtyProcured(plantName: string, qty: number, row: ConsolidatedRow) {
    setState((prev) => {
      const current = prev[plantName];
      if (!current) return prev;
      const procurableItems = row.items.filter(
        (i) => i.status === "trip_assigned" || i.status === "procured"
      );
      const totalNeeded = procurableItems.reduce((s, i) => s + i.quantity, 0);

      // Auto-distribute proportionally
      let allocations: Record<string, number>;
      if (qty >= totalNeeded) {
        allocations = Object.fromEntries(procurableItems.map((i) => [i.id, i.quantity]));
      } else {
        // Proportional distribution
        allocations = {};
        let remaining = qty;
        for (let idx = 0; idx < procurableItems.length; idx++) {
          const item = procurableItems[idx];
          if (idx === procurableItems.length - 1) {
            allocations[item.id] = Math.max(0, remaining);
          } else {
            const share = Math.round((item.quantity / totalNeeded) * qty);
            const alloc = Math.min(share, remaining, item.quantity);
            allocations[item.id] = alloc;
            remaining -= alloc;
          }
        }
      }

      // Auto-expand allocation section if partial
      if (qty < totalNeeded) {
        setExpandedPlants((prev) => new Set(prev).add(plantName));
      }

      return { ...prev, [plantName]: { ...current, qtyProcured: qty, allocations } };
    });
  }

  function updateAllocation(plantName: string, itemId: string, qty: number) {
    setState((prev) => {
      const current = prev[plantName];
      if (!current) return prev;
      return {
        ...prev,
        [plantName]: {
          ...current,
          allocations: { ...current.allocations, [itemId]: qty },
        },
      };
    });
  }

  function updateUnitPrice(plantName: string, price: string) {
    setState((prev) => {
      const current = prev[plantName];
      if (!current) return prev;
      return { ...prev, [plantName]: { ...current, unitPrice: price } };
    });
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    try {
      const procureDate = new Date().toISOString().split("T")[0];
      const errors: string[] = [];
      const newSaved = new Set(savedPlants);

      for (const row of rows) {
        const ps = state[row.plant_name];
        if (!ps) continue;

        const procurableItems = row.items.filter(
          (i) => i.status === "trip_assigned" || i.status === "procured"
        );
        if (procurableItems.length === 0) continue;

        const price = parseFloat(ps.unitPrice);
        if (isNaN(price) || price < 0) {
          errors.push(`${row.plant_name}: invalid unit price`);
          continue;
        }

        // Validate allocations sum
        const totalAlloc = Object.values(ps.allocations).reduce((s, v) => s + v, 0);
        if (totalAlloc !== ps.qtyProcured) {
          errors.push(`${row.plant_name}: allocations (${totalAlloc}) must equal procured qty (${ps.qtyProcured})`);
          continue;
        }

        for (const item of procurableItems) {
          const allocation = ps.allocations[item.id] ?? 0;
          if (allocation === 0 && item.status === "trip_assigned") {
            // Skip items with zero allocation — they keep their current status
            continue;
          }

          // Only call API for trip_assigned items, or procured items being re-edited
          if (item.status !== "trip_assigned" && item.status !== "procured") continue;

          // For already-procured items, only update if values changed
          if (
            item.status === "procured" &&
            item.qty_procured === allocation &&
            item.actual_unit_price === price
          ) {
            continue;
          }

          const body: Record<string, unknown> = {
            qty_procured: allocation,
            actual_unit_price: price,
            procurement_date: procureDate,
            nursery_name: tripNurseryName || undefined,
          };

          if (allocation < item.quantity) {
            body.balance_action = "keep_pending";
          }

          const res = await fetch(`/api/ops/plant-order-items/${item.id}/procure`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
            errors.push(`${row.plant_name} (${item.customer_name}): ${errBody.error ?? "Failed"}`);
          }
        }

        if (errors.length === 0) {
          newSaved.add(row.plant_name);
        }
      }

      setSavedPlants(newSaved);

      if (errors.length > 0) {
        setError(errors.join("; "));
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[11px] text-sage font-medium uppercase tracking-wider">
        <span>Plant</span>
        <span className="w-16 text-center">Needed</span>
        <span className="w-20 text-center">Procured</span>
        <span className="w-24 text-center">Unit Price</span>
      </div>

      {rows.map((row) => {
        const ps = state[row.plant_name];
        const procurableItems = row.items.filter(
          (i) => i.status === "trip_assigned" || i.status === "procured"
        );
        if (!ps || procurableItems.length === 0) {
          // Non-procurable row (e.g., all cancelled/installed) — show read-only
          return (
            <div key={row.plant_name} className="bg-offwhite rounded-xl border border-stone/60 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                {row.thumbnail_url ? (
                  <img src={row.thumbnail_url} alt={row.plant_name} className="w-9 h-9 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sprout size={16} className="text-forest" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-charcoal">{row.plant_name}</span>
                  {row.price_band && <span className="text-xs text-sage ml-2">{row.price_band}</span>}
                </div>
                <span className="text-xs text-stone">Qty: {row.total_qty}</span>
              </div>
            </div>
          );
        }

        const totalNeeded = procurableItems.reduce((s, i) => s + i.quantity, 0);
        const isShortage = ps.qtyProcured < totalNeeded;
        const isExpanded = expandedPlants.has(row.plant_name);
        const allAlreadyProcured = procurableItems.every((i) => i.status === "procured");
        const totalAllocated = Object.values(ps.allocations).reduce((s, v) => s + v, 0);
        const allocMismatch = totalAllocated !== ps.qtyProcured;

        return (
          <div
            key={row.plant_name}
            className={`bg-offwhite rounded-xl border ${
              savedPlants.has(row.plant_name) ? "border-forest/40" : "border-stone/60"
            } overflow-hidden`}
          >
            {/* Main row */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-3 py-2.5">
              {/* Plant info */}
              <div className="flex items-center gap-2.5 min-w-0">
                {row.thumbnail_url ? (
                  <img src={row.thumbnail_url} alt={row.plant_name} className="w-9 h-9 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sprout size={16} className="text-forest" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-charcoal truncate">{row.plant_name}</p>
                  {row.price_band && (
                    <p className="text-[11px] text-sage">{row.price_band}</p>
                  )}
                  {allAlreadyProcured && (
                    <p className="text-[10px] text-forest font-medium">Procured</p>
                  )}
                </div>
              </div>

              {/* Needed */}
              <div className="w-16 text-center">
                <span className="text-sm text-charcoal font-medium">{totalNeeded}</span>
              </div>

              {/* Procured input */}
              <div className="w-20">
                <input
                  type="number"
                  min={0}
                  max={totalNeeded}
                  value={ps.qtyProcured}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0) {
                      updateQtyProcured(row.plant_name, Math.min(val, totalNeeded), row);
                    }
                  }}
                  className={`w-full px-2 py-1.5 border rounded-lg text-sm text-center text-charcoal bg-offwhite focus:outline-none focus:border-forest ${
                    isShortage ? "border-terra" : "border-stone"
                  }`}
                />
              </div>

              {/* Unit price input */}
              <div className="w-24">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-sage">Rs.</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={ps.unitPrice}
                    onChange={(e) => updateUnitPrice(row.plant_name, e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 border border-stone rounded-lg text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest text-right"
                  />
                </div>
              </div>
            </div>

            {/* Shortage / allocation toggle */}
            {isShortage && procurableItems.length > 1 && (
              <div className="px-3 pb-2">
                <button
                  onClick={() => toggleExpand(row.plant_name)}
                  className="flex items-center gap-1 text-xs text-terra font-medium hover:text-terra/80 transition-colors"
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {isExpanded ? "Hide" : "Allocate"} across {procurableItems.length} customers
                  {allocMismatch && (
                    <span className="ml-1 text-[10px] bg-terra/10 text-terra px-1.5 py-0.5 rounded-full">
                      {totalAllocated}/{ps.qtyProcured}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Expanded allocation section */}
            {isExpanded && isShortage && procurableItems.length > 1 && (
              <div className="border-t border-stone/30 bg-cream/50 px-3 py-2 space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] text-sage uppercase tracking-wider font-medium">
                  <span>Customer</span>
                  <span className="w-12 text-center">Need</span>
                  <span className="w-16 text-center">Alloc</span>
                </div>
                {procurableItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <span className="text-xs text-charcoal truncate">{item.customer_name ?? "Unknown"}</span>
                    <span className="w-12 text-center text-xs text-sage">{item.quantity}</span>
                    <div className="w-16">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={ps.allocations[item.id] ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 0) {
                            updateAllocation(row.plant_name, item.id, Math.min(val, item.quantity));
                          }
                        }}
                        className={`w-full px-1.5 py-1 border rounded-lg text-xs text-center text-charcoal bg-offwhite focus:outline-none focus:border-forest ${
                          (ps.allocations[item.id] ?? 0) < item.quantity ? "border-terra/60" : "border-stone"
                        }`}
                      />
                    </div>
                  </div>
                ))}
                {allocMismatch && (
                  <p className="text-[10px] text-terra mt-1">
                    Total allocated: {totalAllocated} / {ps.qtyProcured} procured
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <div className="bg-terra/5 border border-terra/30 rounded-xl px-3 py-2 text-xs text-terra">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full mt-3 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {saving ? "Saving..." : "Save Procurement"}
      </button>
    </div>
  );
}

/* ---------- Page ---------- */

export default function NurseryTripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Add Orders modal
  const [addOrdersOpen, setAddOrdersOpen] = useState(false);
  const [requestedItems, setRequestedItems] = useState<RequestedItem[]>([]);
  const [requestedLoading, setRequestedLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [addingItems, setAddingItems] = useState(false);

  // Procure modal
  const [procureItem, setProcureItem] = useState<TripItem | null>(null);
  const [procureQty, setProcureQty] = useState("");
  const [procurePrice, setProcurePrice] = useState("");
  const [procureDate, setProcureDate] = useState("");
  const [procureNursery, setProcureNursery] = useState("");
  const [balanceAction, setBalanceAction] = useState<"keep_pending" | "cancel">("keep_pending");
  const [balanceNewDueDate, setBalanceNewDueDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [procuring, setProcuring] = useState(false);

  const fetchTrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/nursery-trips/${tripId}`);
      if (res.ok) {
        const json = await res.json();
        setTrip(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  async function handleComplete() {
    setActionLoading("complete");
    try {
      const res = await fetch(`/api/ops/nursery-trips/${tripId}/complete`, { method: "POST" });
      if (res.ok) fetchTrip();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    setActionLoading("cancel");
    try {
      const res = await fetch(`/api/ops/nursery-trips/${tripId}/cancel`, { method: "POST" });
      if (res.ok) fetchTrip();
    } finally {
      setActionLoading(null);
    }
  }

  async function openAddOrders() {
    setAddOrdersOpen(true);
    setRequestedLoading(true);
    setSelectedItemIds(new Set());
    try {
      const res = await fetch("/api/ops/plant-orders?status=requested&include_items=true");
      if (res.ok) {
        const json = await res.json();
        // Extract items from orders that are in 'requested' status
        const items: RequestedItem[] = [];
        for (const order of json.data ?? []) {
          if (order.items) {
            for (const item of order.items) {
              if (item.status === "requested") {
                items.push({
                  id: item.id,
                  plant_name: item.plant_name,
                  quantity: item.quantity,
                  note: item.note,
                  due_date: order.due_date,
                  customer_name: order.customer_name,
                  order_id: order.id,
                });
              }
            }
          }
        }
        setRequestedItems(items);
      }
    } finally {
      setRequestedLoading(false);
    }
  }

  function toggleItemSelection(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddItems() {
    if (selectedItemIds.size === 0) return;
    setAddingItems(true);
    try {
      const res = await fetch(`/api/ops/nursery-trips/${tripId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: Array.from(selectedItemIds) }),
      });
      if (res.ok) {
        setAddOrdersOpen(false);
        fetchTrip();
      }
    } finally {
      setAddingItems(false);
    }
  }

  function openProcure(item: TripItem) {
    setProcureItem(item);
    setProcureQty(String(item.quantity));
    setProcurePrice("");
    setProcureDate(new Date().toISOString().split("T")[0]);
    setProcureNursery(trip?.nursery_name ?? "");
    setBalanceAction("keep_pending");
    setBalanceNewDueDate("");
    setCancelReason("");
  }

  async function handleProcure() {
    if (!procureItem) return;
    const qty = parseInt(procureQty, 10);
    const price = parseFloat(procurePrice);
    if (!qty || qty < 1 || isNaN(price) || price < 0 || !procureDate) return;

    setProcuring(true);
    try {
      const body: Record<string, unknown> = {
        qty_procured: qty,
        actual_unit_price: price,
        procurement_date: procureDate,
        nursery_name: procureNursery || undefined,
      };

      if (qty < procureItem.quantity) {
        body.balance_action = balanceAction;
        if (balanceAction === "keep_pending" && balanceNewDueDate) {
          body.balance_new_due_date = balanceNewDueDate;
        }
        if (balanceAction === "cancel" && cancelReason) {
          body.cancel_reason = cancelReason;
        }
      }

      const res = await fetch(`/api/ops/plant-order-items/${procureItem.id}/procure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setProcureItem(null);
        fetchTrip();
      }
    } finally {
      setProcuring(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    setActionLoading(`remove-${itemId}`);
    try {
      const res = await fetch(`/api/ops/nursery-trips/${tripId}/items?item_id=${itemId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchTrip();
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-sage" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-cream px-4 pt-6 pb-20">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-sage mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-stone text-center py-10">Trip not found.</p>
      </div>
    );
  }

  const badge = STATUS_BADGE[trip.status] ?? { cls: "bg-stone/20 text-charcoal", label: trip.status };
  const isPlanned = trip.status === "planned";
  const isCompleted = trip.status === "completed";

  // Consolidated view: group items by plant_name
  const consolidated = trip.items.reduce<Record<string, { plant_name: string; total_qty: number; total_procured: number; thumbnail_url: string | null; price_band: string | null; items: TripItem[] }>>((acc, item) => {
    if (!acc[item.plant_name]) {
      acc[item.plant_name] = { plant_name: item.plant_name, total_qty: 0, total_procured: 0, thumbnail_url: item.thumbnail_url, price_band: item.price_band, items: [] };
    }
    acc[item.plant_name].total_qty += item.quantity;
    acc[item.plant_name].total_procured += item.qty_procured ?? 0;
    acc[item.plant_name].items.push(item);
    // Keep first non-null thumbnail
    if (!acc[item.plant_name].thumbnail_url && item.thumbnail_url) {
      acc[item.plant_name].thumbnail_url = item.thumbnail_url;
    }
    if (!acc[item.plant_name].price_band && item.price_band) {
      acc[item.plant_name].price_band = item.price_band;
    }
    return acc;
  }, {});

  // Customer breakdown: group items by customer
  const byCustomer = trip.items.reduce<Record<string, { customer_name: string; items: TripItem[] }>>((acc, item) => {
    const key = item.customer_id ?? "unknown";
    if (!acc[key]) {
      acc[key] = { customer_name: item.customer_name ?? "Unknown", items: [] };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  const isPartialProcure = procureItem && parseInt(procureQty, 10) < procureItem.quantity;

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-sage mb-3">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1
              className="text-2xl text-charcoal"
              style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
            >
              {formatDate(trip.trip_date)}
            </h1>
            {trip.nursery_name && (
              <p className="text-sm text-sage mt-0.5">{trip.nursery_name}</p>
            )}
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {trip.notes && (
          <p className="text-xs text-stone mt-2">{trip.notes}</p>
        )}

        {/* Action buttons */}
        {isPlanned && (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleComplete}
              disabled={actionLoading === "complete"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden disabled:opacity-50 transition-colors"
            >
              {actionLoading === "complete" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Mark Completed
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading === "cancel"}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone text-charcoal text-xs font-medium rounded-full hover:bg-cream disabled:opacity-50 transition-colors"
            >
              {actionLoading === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Cancel Trip
            </button>
            <button
              onClick={openAddOrders}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone text-charcoal text-xs font-medium rounded-full hover:bg-cream transition-colors ml-auto"
            >
              <Plus size={14} />
              Add Orders
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-6">
        {trip.items.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">
            No items linked to this trip yet.
          </p>
        ) : (
          <>
            {/* Consolidated View */}
            <section>
              <h2
                className="text-lg text-charcoal mb-3"
                style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
              >
                Consolidated
              </h2>

              {isCompleted ? (
                <ConsolidatedProcurement
                  rows={Object.values(consolidated)}
                  tripNurseryName={trip.nursery_name}
                  onSaved={fetchTrip}
                />
              ) : (
                <div className="bg-offwhite rounded-2xl border border-stone/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone text-left text-sage">
                        <th className="py-2 px-3 font-medium">Plant</th>
                        <th className="py-2 px-3 font-medium text-right">Qty</th>
                        <th className="py-2 px-3 font-medium text-right">Expected Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(consolidated).map((row) => (
                        <tr key={row.plant_name} className="border-b border-stone/30 last:border-0">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2.5">
                              {row.thumbnail_url ? (
                                <img src={row.thumbnail_url} alt={row.plant_name} className="w-9 h-9 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                              ) : (
                                <div className="w-9 h-9 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <Sprout size={16} className="text-forest" />
                                </div>
                              )}
                              <span className="text-charcoal">{row.plant_name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-charcoal text-right">{row.total_qty}</td>
                          <td className="py-2 px-3 text-sage text-right">{row.price_band ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Customer Breakdown */}
            <section>
              <h2
                className="text-lg text-charcoal mb-3"
                style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
              >
                By Customer
              </h2>
              <div className="space-y-3">
                {Object.entries(byCustomer).map(([key, group]) => (
                  <div
                    key={key}
                    className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3"
                  >
                    <p className="font-medium text-charcoal text-sm mb-2">{group.customer_name}</p>
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const itemBadge = ITEM_STATUS_BADGE[item.status] ?? {
                          cls: "bg-stone/20 text-charcoal",
                          label: item.status,
                        };
                        return (
                          <div key={item.id} className="border-t border-stone/30 pt-2 first:border-0 first:pt-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-charcoal">{item.plant_name}</p>
                                <p className="text-xs text-sage">
                                  Qty: {item.quantity}
                                  {item.qty_procured != null && ` / Procured: ${item.qty_procured}`}
                                  {item.actual_unit_price != null && ` / @Rs.${item.actual_unit_price}`}
                                </p>
                                {item.note && (
                                  <p className="text-xs text-stone mt-0.5">{item.note}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${itemBadge.cls}`}>
                                  {itemBadge.label}
                                </span>
                                {isPlanned && item.status === "trip_assigned" && (
                                  <button
                                    onClick={() => handleRemoveItem(item.id)}
                                    disabled={actionLoading === `remove-${item.id}`}
                                    className="p-1 text-sage hover:text-terra transition-colors"
                                    title="Remove from trip"
                                  >
                                    {actionLoading === `remove-${item.id}` ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Procurement button for completed trips */}
                            {isCompleted && item.status === "trip_assigned" && (
                              <button
                                onClick={() => openProcure(item)}
                                className="mt-1.5 px-3 py-1 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
                              >
                                Record Procurement
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Add Orders — Inline Table */}
      {addOrdersOpen && (
        <div className="px-4 pt-4 max-w-[700px] mx-auto">
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-sage uppercase tracking-widest">Add Open Orders to Trip</p>
              <button onClick={() => setAddOrdersOpen(false)} className="text-stone hover:text-charcoal">
                <X size={16} />
              </button>
            </div>

            {requestedLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-sage" />
              </div>
            ) : requestedItems.length === 0 ? (
              <p className="text-sm text-stone text-center py-6">No requested items available.</p>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone/30">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === requestedItems.length && requestedItems.length > 0}
                      onChange={() => {
                        if (selectedItemIds.size === requestedItems.length) {
                          setSelectedItemIds(new Set());
                        } else {
                          setSelectedItemIds(new Set(requestedItems.map((i) => i.id)));
                        }
                      }}
                      className="accent-forest"
                    />
                    <span className="text-xs text-charcoal font-medium">
                      Select All ({requestedItems.length} items)
                    </span>
                  </label>
                  <span className="text-xs text-sage">{selectedItemIds.size} selected</span>
                </div>

                {/* Table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone/40 text-left text-sage text-xs">
                      <th className="py-1.5 pr-2 w-8"></th>
                      <th className="py-1.5 pr-2">Plant</th>
                      <th className="py-1.5 pr-2">Customer</th>
                      <th className="py-1.5 pr-2 text-center">Qty</th>
                      <th className="py-1.5">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestedItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-b border-stone/20 cursor-pointer transition-colors ${
                          selectedItemIds.has(item.id) ? "bg-forest/5" : "hover:bg-cream/50"
                        }`}
                        onClick={() => toggleItemSelection(item.id)}
                      >
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            className="accent-forest"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <p className="text-charcoal font-medium">{item.plant_name}</p>
                          {item.note && <p className="text-[10px] text-stone">{item.note}</p>}
                        </td>
                        <td className="py-2 pr-2 text-sage">{item.customer_name}</td>
                        <td className="py-2 pr-2 text-center text-charcoal font-medium">{item.quantity}</td>
                        <td className="py-2 text-sage text-xs">{item.due_date ? formatDate(item.due_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Add button */}
                <button
                  onClick={handleAddItems}
                  disabled={selectedItemIds.size === 0 || addingItems}
                  className="w-full mt-4 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {addingItems && <Loader2 size={16} className="animate-spin" />}
                  {addingItems
                    ? "Adding..."
                    : `Add ${selectedItemIds.size} ${selectedItemIds.size === 1 ? "Item" : "Items"} to Trip`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Procure Modal */}
      <SlideUpModal
        open={!!procureItem}
        onClose={() => setProcureItem(null)}
        title="Record Procurement"
      >
        {procureItem && (
          <div className="space-y-3">
            <div className="bg-cream rounded-xl px-3 py-2 mb-1">
              <p className="text-sm text-charcoal font-medium">{procureItem.plant_name}</p>
              <p className="text-xs text-sage">
                {procureItem.customer_name} &middot; Ordered: {procureItem.quantity}
              </p>
            </div>

            <div>
              <label className="block text-xs text-sage mb-1">Qty Procured *</label>
              <input
                type="number"
                className={INPUT_CLS}
                min={1}
                max={procureItem.quantity}
                value={procureQty}
                onChange={(e) => setProcureQty(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-sage mb-1">Actual Unit Price (Rs.) *</label>
              <input
                type="number"
                className={INPUT_CLS}
                min={0}
                step="0.01"
                placeholder="0.00"
                value={procurePrice}
                onChange={(e) => setProcurePrice(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-sage mb-1">Procurement Date *</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={procureDate}
                onChange={(e) => setProcureDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-sage mb-1">Nursery Name</label>
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="Nursery name"
                value={procureNursery}
                onChange={(e) => setProcureNursery(e.target.value)}
              />
            </div>

            {/* Balance action when partial */}
            {isPartialProcure && (
              <div className="border-t border-stone/30 pt-3 space-y-3">
                <p className="text-xs text-terra font-medium">
                  Partial procurement: {procureItem.quantity - parseInt(procureQty, 10)} remaining
                </p>
                <div>
                  <label className="block text-xs text-sage mb-1">Balance Action *</label>
                  <select
                    className={INPUT_CLS}
                    value={balanceAction}
                    onChange={(e) => setBalanceAction(e.target.value as "keep_pending" | "cancel")}
                  >
                    <option value="keep_pending">Keep Pending</option>
                    <option value="cancel">Cancel Remainder</option>
                  </select>
                </div>

                {balanceAction === "keep_pending" && (
                  <div>
                    <label className="block text-xs text-sage mb-1">New Due Date</label>
                    <input
                      type="date"
                      className={INPUT_CLS}
                      value={balanceNewDueDate}
                      onChange={(e) => setBalanceNewDueDate(e.target.value)}
                    />
                  </div>
                )}

                {balanceAction === "cancel" && (
                  <div>
                    <label className="block text-xs text-sage mb-1">Cancel Reason</label>
                    <textarea
                      className={INPUT_CLS}
                      rows={2}
                      placeholder="Reason for cancellation..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleProcure}
              disabled={!procureQty || !procurePrice || !procureDate || procuring}
              className="w-full mt-2 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {procuring && <Loader2 size={16} className="animate-spin" />}
              {procuring ? "Recording..." : "Record Procurement"}
            </button>
          </div>
        )}
      </SlideUpModal>
    </div>
  );
}
