"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

/* ---------- Types ---------- */

type NurseryTrip = {
  id: string;
  trip_date: string;
  nursery_name: string | null;
  status: string;
  notes: string | null;
  item_count: number;
  created_at: string;
};

/* ---------- Constants ---------- */

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  planned: { cls: "bg-blue-50 text-blue-700", label: "Planned" },
  completed: { cls: "bg-forest/10 text-forest", label: "Completed" },
  cancelled: { cls: "bg-stone/20 text-sage", label: "Cancelled" },
};

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
      <div className="relative w-full max-w-lg bg-offwhite rounded-t-2xl p-5 pb-8 mb-16 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
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

/* ---------- Page ---------- */

export default function NurseryTripsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [tripDate, setTripDate] = useState("");
  const [nurseryName, setNurseryName] = useState("");
  const [notes, setNotes] = useState("");

  const apiUrl =
    statusFilter === "all"
      ? "/api/ops/nursery-trips"
      : `/api/ops/nursery-trips?status=${statusFilter}`;

  const { data, isLoading, mutate } = useSWR<{ data: NurseryTrip[] }>(apiUrl, fetcher);
  const trips = data?.data ?? [];

  const pillCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
      active
        ? "bg-forest text-offwhite border-forest"
        : "bg-cream text-charcoal border-stone"
    }`;

  async function handleCreate() {
    if (!tripDate) return;
    setCreating(true);
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
        setCreateOpen(false);
        setTripDate("");
        setNurseryName("");
        setNotes("");
        mutate();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Sticky header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Nursery Trips
          </h1>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
          >
            <Plus size={14} />
            New Trip
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={pillCls(statusFilter === f.value)}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {isLoading ? (
          <p className="text-sm text-sage text-center py-10">Loading...</p>
        ) : trips.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">
            No nursery trips found.
          </p>
        ) : (
          <div className="space-y-2">
            {trips.map((trip) => {
              const badge = STATUS_BADGE[trip.status] ?? {
                cls: "bg-stone/20 text-charcoal",
                label: trip.status,
              };
              return (
                <div
                  key={trip.id}
                  className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2 cursor-pointer active:bg-cream/60 transition-colors"
                  onClick={() => router.push(`/ops/nursery-trips/${trip.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-charcoal text-sm">
                        {formatDate(trip.trip_date)}
                      </p>
                      {trip.nursery_name && (
                        <p className="text-xs text-sage mt-0.5">{trip.nursery_name}</p>
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
                    <span className="text-xs text-sage">
                      Created {formatDate(trip.created_at.split("T")[0])}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Trip Modal */}
      <SlideUpModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Nursery Trip"
      >
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
          <button
            onClick={handleCreate}
            disabled={!tripDate || creating}
            className="w-full mt-2 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {creating && <Loader2 size={16} className="animate-spin" />}
            {creating ? "Creating..." : "Create Trip"}
          </button>
        </div>
      </SlideUpModal>
    </div>
  );
}
