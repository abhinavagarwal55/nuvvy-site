"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Rail = {
  id: string;
  title: string;
  subtitle: string | null;
  segment: "plants" | "accessories";
  status: "draft" | "active" | "inactive";
  display_order: number;
  item_count: number;
  updated_at: string;
};

const STATUS_CLS: Record<Rail["status"], string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  inactive: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<Rail["status"], string> = {
  active: "Active",
  draft: "Draft",
  inactive: "Inactive",
};

const SEGMENT_LABEL: Record<Rail["segment"], string> = {
  plants: "Plants",
  accessories: "Accessories",
};

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function CuratedRailsListPage() {
  const router = useRouter();
  const [rails, setRails] = useState<Rail[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<"All" | "plants" | "accessories">("All");
  const [status, setStatus] = useState<string>("draft,active");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [busyReorderId, setBusyReorderId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (segment !== "All") params.set("segment", segment);
    if (status) params.set("status", status);
    if (qDebounced) params.set("q", qDebounced);
    const res = await fetch(`/api/internal/catalog/rails?${params.toString()}`);
    const json = await res.json();
    setRails(json.data ?? []);
    setLoading(false);
  }, [segment, status, qDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  // Group rails by segment for reorder scope
  const railsBySegment = useMemo(() => {
    const groups: Record<string, Rail[]> = { plants: [], accessories: [] };
    for (const r of rails) groups[r.segment].push(r);
    return groups;
  }, [rails]);

  async function persistOrderForSegment(seg: "plants" | "accessories", orderedIds: string[]) {
    setBusyReorderId(orderedIds[0]);
    await fetch("/api/internal/catalog/rails/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_rail_ids: orderedIds }),
    });
    setBusyReorderId(null);
    load();
    void seg;
  }

  function move(rail: Rail, direction: -1 | 1) {
    const peers = railsBySegment[rail.segment];
    const idx = peers.findIndex((r) => r.id === rail.id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= peers.length) return;
    const next = [...peers];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    void persistOrderForSegment(
      rail.segment,
      next.map((r) => r.id)
    );
  }

  return (
    <div className="hidden md:block">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Curated Rails</h1>
          <p className="text-sm text-gray-600 mt-1">{rails.length} rails</p>
        </div>
        <button
          onClick={() => router.push("/internal/catalog/rails/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Rail
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className={inputCls} value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)}>
          <option value="All">All segments</option>
          <option value="plants">Plants</option>
          <option value="accessories">Accessories</option>
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft,active">Draft + Active</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
          <option value="">All statuses</option>
        </select>
        <input
          type="text"
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={inputCls + " flex-1 min-w-[200px]"}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-10">Loading…</p>
        ) : rails.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">No rails yet. Click + New Rail to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 w-20">Order</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Segment</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(["plants", "accessories"] as const).map((seg) => {
                const peers = railsBySegment[seg];
                if (peers.length === 0) return null;
                return peers.map((rail, idx) => (
                  <tr key={rail.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => move(rail, -1)}
                          disabled={idx === 0 || busyReorderId !== null}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs disabled:opacity-30 hover:bg-gray-100"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(rail, 1)}
                          disabled={idx === peers.length - 1 || busyReorderId !== null}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs disabled:opacity-30 hover:bg-gray-100"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/internal/catalog/rails/${rail.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {rail.title}
                      </Link>
                      {rail.subtitle && <p className="text-xs text-gray-500">{rail.subtitle}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                        {SEGMENT_LABEL[rail.segment]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{rail.item_count}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_CLS[rail.status]}`}>
                        {STATUS_LABEL[rail.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(rail.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
