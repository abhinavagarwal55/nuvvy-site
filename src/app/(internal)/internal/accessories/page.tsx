"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trash2, RotateCcw } from "lucide-react";
import type {
  CatalogProduct,
  CatalogProductCategory,
  CatalogProductStatus,
} from "@/lib/catalog/catalogProductTypes";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_BADGE_CLS,
  STATUS_LABELS,
  formatPriceInr,
} from "@/lib/catalog/catalogProductLabels";

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

function StatusBadge({ status }: { status: CatalogProductStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_BADGE_CLS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function MobileNotice() {
  return (
    <div className="md:hidden p-6 text-sm text-gray-700">
      Manage accessories on desktop — this screen is read-only on phone.
    </div>
  );
}

export default function AccessoriesListPage() {
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<string>("active,draft");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [sort, setSort] = useState("updated_at_desc");

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (qDebounced) params.set("q", qDebounced);
    if (sort) params.set("sort", sort);
    const res = await fetch(`/api/internal/accessories?${params.toString()}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [category, status, qDebounced, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSoftDelete(p: CatalogProduct) {
    if (!confirm(`Mark "${p.name}" inactive?\n\nThe product will be hidden from customers. Existing shortlist references stay intact.`)) {
      return;
    }
    setBusyId(p.id);
    const res = await fetch(`/api/internal/accessories/${p.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to mark inactive");
      return;
    }
    void load();
  }

  async function handleRestore(p: CatalogProduct) {
    setBusyId(p.id);
    const res = await fetch(`/api/internal/accessories/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to restore");
      return;
    }
    void load();
  }

  return (
    <>
      <MobileNotice />
      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Accessories</h1>
            <p className="text-sm text-gray-600 mt-1">
              {total} {total === 1 ? "product" : "products"}
            </p>
          </div>
          <Link
            href="/internal/accessories/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Add Accessory
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active,draft">Active + Draft</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="unavailable">Unavailable</option>
            <option value="inactive">Inactive</option>
            <option value="">All statuses</option>
          </select>
          <input
            type="text"
            className={inputCls + " flex-1 min-w-[200px]"}
            placeholder="Search name, brand, ASIN…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className={inputCls}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="updated_at_desc">Recently updated</option>
            <option value="updated_at_asc">Oldest updated</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="price_asc">Price low → high</option>
            <option value="price_desc">Price high → low</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-10">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No accessories yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-16"></th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">ASIN</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {p.thumbnail_storage_url || p.thumbnail_url || p.image_storage_url || p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            p.thumbnail_storage_url ||
                            p.thumbnail_url ||
                            p.image_storage_url ||
                            p.image_url ||
                            ""
                          }
                          alt={p.name}
                          className="w-10 h-10 rounded object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/internal/accessories/${p.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{p.brand ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {CATEGORY_LABELS[p.category as CatalogProductCategory]}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {formatPriceInr(p.price_inr)}
                      {p.price_snapshot_at && (
                        <span className="block text-[10px] text-gray-400">
                          as of {new Date(p.price_snapshot_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={p.status as CatalogProductStatus} />
                    </td>
                    <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                      {p.amazon_asin ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "inactive" ? (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => handleRestore(p)}
                          title="Restore (set to Draft)"
                          className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-40"
                        >
                          <RotateCcw size={15} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => handleSoftDelete(p)}
                          title="Mark inactive (soft delete)"
                          className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
