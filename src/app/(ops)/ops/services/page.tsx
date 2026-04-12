"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

type Service = {
  id: string;
  customer_name: string;
  gardener_name: string | null;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

const STATUS_CLS: Record<string, { cls: string; label: string }> = {
  scheduled: { cls: "bg-cream text-charcoal", label: "Scheduled" },
  in_progress: { cls: "bg-forest/10 text-forest", label: "In Progress" },
  completed: { cls: "bg-[#EAF2EC] text-forest", label: "Completed" },
  not_completed: { cls: "bg-terra/10 text-terra", label: "Not Completed" },
  missed: { cls: "bg-terra/10 text-terra", label: "Missed" },
  cancelled: { cls: "bg-stone/30 text-sage", label: "Cancelled" },
};

const inputCls =
  "px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest";

type GardenerOption = { id: string; name: string };

export default function ServiceLogPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [gardenerFilter, setGardenerFilter] = useState("");
  const [gardeners, setGardeners] = useState<GardenerOption[]>([]);

  useEffect(() => {
    fetch("/api/ops/gardeners")
      .then((r) => r.json())
      .then((d) => setGardeners(d.data ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (gardenerFilter) params.set("gardener_id", gardenerFilter);
    const qs = params.toString();
    const res = await fetch(`/api/ops/schedule/services${qs ? `?${qs}` : ""}`);
    const json = await res.json();
    setServices(json.data ?? []);
    setLoading(false);
  }, [statusFilter, dateFrom, dateTo, gardenerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <h1
          className="text-2xl text-charcoal mb-3"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Services
        </h1>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {["all", "scheduled", "in_progress", "completed", "not_completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                statusFilter === s
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {s === "all" ? "All" : STATUS_CLS[s]?.label ?? s}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-2 flex-wrap">
          <select
            className={inputCls}
            value={gardenerFilter}
            onChange={(e) => setGardenerFilter(e.target.value)}
          >
            <option value="">All gardeners</option>
            {gardeners.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={inputCls}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
          />
          <input
            type="date"
            className={inputCls}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
          />
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">No services found.</p>
        ) : (
          services.map((svc) => {
            const badge = STATUS_CLS[svc.status] ?? { cls: "bg-stone/30 text-charcoal", label: svc.status };
            return (
              <Link key={svc.id} href={`/ops/services/${svc.id}`}>
                <div className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 flex items-center gap-3 hover:border-forest/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-charcoal truncate">
                        {svc.customer_name}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-sage mt-0.5">
                      <span>{formatDate(svc.scheduled_date)}</span>
                      {svc.time_window_start && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {svc.time_window_start}–{svc.time_window_end}
                        </span>
                      )}
                      {svc.gardener_name && <span>{svc.gardener_name}</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-stone flex-shrink-0" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
