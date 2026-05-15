"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatPriceInr,
} from "@/lib/catalog/catalogProductLabels";
import type { CatalogProductCategory } from "@/lib/catalog/catalogProductTypes";

type SearchResult = {
  id: string;
  name: string;
  brand: string | null;
  category: CatalogProductCategory;
  price_inr: number | null;
  price_snapshot_at: string | null;
  thumbnail_storage_url: string | null;
  thumbnail_url: string | null;
  image_storage_url: string | null;
  image_url: string | null;
  amazon_asin: string | null;
};

function bestThumbnail(p: SearchResult): string | null {
  return (
    p.thumbnail_storage_url ||
    p.thumbnail_url ||
    p.image_storage_url ||
    p.image_url ||
    null
  );
}

export default function AddAccessoryModal({
  shortlistId,
  alreadyAddedIds,
  onClose,
  onAdded,
}: {
  shortlistId: string;
  alreadyAddedIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<CatalogProductCategory | "">("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (qDebounced) params.set("q", qDebounced);
      if (category) params.set("category", category);
      params.set("limit", "50");
      try {
        const res = await fetch(`/api/internal/accessories/search?${params.toString()}`);
        const json = await res.json();
        if (!cancelled) setResults(json.data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [qDebounced, category]);

  function toggleSelected(id: string) {
    if (alreadyAddedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    // Add sequentially so audit-log ordering is deterministic
    for (const productId of selected) {
      const res = await fetch(`/api/internal/shortlists/${shortlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_product_id: productId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `Failed to add product ${productId.substring(0, 8)}`);
        setAdding(false);
        return;
      }
    }
    setAdding(false);
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Accessory</h2>
          <button
            onClick={onClose}
            disabled={adding}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-200 space-y-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, brand, ASIN…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCategory("")}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                category === "" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700"
              }`}
            >
              All
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  category === c ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No accessories match.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((p) => {
                const isAdded = alreadyAddedIds.has(p.id);
                const isSelected = selected.has(p.id);
                const thumb = bestThumbnail(p);
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-3 py-2 ${isAdded ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}
                    onClick={() => toggleSelected(p.id)}
                  >
                    <div className="flex-shrink-0">
                      {thumb ? (
                        <Image src={thumb} alt={p.name} width={48} height={48} className="rounded object-cover border border-gray-200" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {p.brand ? <span className="italic">{p.brand}</span> : null}
                        {p.brand ? " · " : ""}
                        {CATEGORY_LABELS[p.category as CatalogProductCategory] ?? p.category}
                        {p.price_inr != null ? ` · ${formatPriceInr(p.price_inr)}` : ""}
                      </p>
                    </div>
                    {isAdded ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                        ✓ Already added
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              disabled={adding}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSelected}
              disabled={adding || selected.size === 0}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium"
            >
              {adding ? "Adding…" : `Add ${selected.size || ""} item${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
