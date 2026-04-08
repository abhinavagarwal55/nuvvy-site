"use client";

import { useState, useEffect, useCallback } from "react";

type Request = {
  id: string;
  customer_id: string;
  type: string;
  description: string | null;
  status: string;
  resolution_type: string | null;
  created_at: string;
};

const TYPE_BADGE: Record<string, { cls: string; label: string }> = {
  problem: { cls: "bg-terra/10 text-terra", label: "Problem" },
  service_request: { cls: "bg-forest/10 text-forest", label: "Service Request" },
  other: { cls: "bg-stone/30 text-charcoal", label: "Other" },
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  open: { cls: "bg-terra/10 text-terra", label: "Open" },
  in_progress: { cls: "bg-forest/10 text-forest", label: "In Progress" },
  resolved: { cls: "bg-[#EAF2EC] text-sage", label: "Resolved" },
  closed: { cls: "bg-stone/30 text-sage", label: "Closed" },
};

const selectCls =
  "px-3 py-1.5 border border-stone rounded-xl text-xs text-charcoal bg-offwhite focus:outline-none focus:border-forest";

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/ops/requests${params}`);
    const json = await res.json();
    const data: Request[] = json.data ?? [];
    setRequests(data);

    // Fetch customer names
    const ids = [...new Set(data.map((r) => r.customer_id))];
    if (ids.length > 0) {
      const custRes = await fetch(
        `/api/ops/customers?${ids.map((id) => `id=${id}`).join("&")}`
      );
      const custJson = await custRes.json();
      const names: Record<string, string> = {};
      for (const c of custJson.data ?? []) names[c.id] = c.name;
      setCustomerNames(names);
    }

    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(reqId: string, newStatus: string) {
    await fetch(`/api/ops/requests/${reqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <h1
          className="text-2xl text-charcoal mb-3"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Requests
        </h1>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["open", "in_progress", "resolved", "closed", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                statusFilter === s
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {s === "all" ? "All" : STATUS_BADGE[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-stone text-center py-10">No requests found.</p>
        ) : (
          requests.map((req) => {
            const typeBadge = TYPE_BADGE[req.type] ?? { cls: "bg-stone/30 text-charcoal", label: req.type };
            const statusBadge = STATUS_BADGE[req.status] ?? { cls: "bg-stone/30 text-charcoal", label: req.status };

            return (
              <div
                key={req.id}
                className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-charcoal text-sm">
                      {customerNames[req.customer_id] ?? "Unknown customer"}
                    </p>
                    {req.description && (
                      <p className="text-xs text-sage mt-0.5 line-clamp-2">
                        {req.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadge.cls}`}>
                      {typeBadge.label}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-stone/30 pt-2">
                  <span className="text-xs text-sage">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                  {req.status !== "closed" && (
                    <select
                      className={selectCls}
                      value={req.status}
                      onChange={(e) => handleStatusChange(req.id, e.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
