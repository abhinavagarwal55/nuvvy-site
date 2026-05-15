"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type PlantResult = {
  id: string;
  airtable_id: string | null;
  name: string;
  scientific_name: string | null;
  price_band: string | null;
  thumbnail_url: string | null;
  thumbnail_storage_url: string | null;
};

type AccessoryResult = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  price_inr: number | null;
  thumbnail_url: string | null;
  thumbnail_storage_url: string | null;
};

type Props = {
  railId: string;
  segment: "plants" | "accessories";
  alreadyAddedIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
};

function bestThumb(p: { thumbnail_storage_url?: string | null; thumbnail_url?: string | null }): string | null {
  return p.thumbnail_storage_url || p.thumbnail_url || null;
}

export default function AddItemsModal({ railId, segment, alreadyAddedIds, onClose, onAdded }: Props) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [results, setResults] = useState<(PlantResult | AccessoryResult)[]>([]);
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
      const endpoint =
        segment === "plants"
          ? `/api/internal/plants/search?limit=50${qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : ""}`
          : `/api/internal/accessories/search?limit=50${qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : ""}`;
      try {
        const res = await fetch(endpoint);
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
  }, [qDebounced, segment]);

  function toggle(id: string) {
    if (alreadyAddedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    for (const id of selected) {
      const body =
        segment === "plants"
          ? JSON.stringify({ plant_id: id })
          : JSON.stringify({ catalog_product_id: id });
      const res = await fetch(`/api/internal/catalog/rails/${railId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed to add ${id.substring(0, 8)}`);
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
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Add {segment === "plants" ? "Plants" : "Accessories"}
          </h2>
          <button onClick={onClose} disabled={adding} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-200">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={segment === "plants" ? "Search name, scientific name…" : "Search name, brand, ASIN…"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No matches.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((p) => {
                const isAdded = alreadyAddedIds.has(p.id);
                const isSelected = selected.has(p.id);
                const thumb = bestThumb(p);
                const subline =
                  segment === "plants"
                    ? [(p as PlantResult).scientific_name, (p as PlantResult).price_band].filter(Boolean).join(" · ")
                    : [
                        (p as AccessoryResult).brand,
                        (p as AccessoryResult).price_inr != null
                          ? `₹${(p as AccessoryResult).price_inr!.toLocaleString("en-IN")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-3 py-2 ${isAdded ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}
                    onClick={() => toggle(p.id)}
                  >
                    <div className="flex-shrink-0">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={p.name}
                          width={48}
                          height={48}
                          className="rounded object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      {subline && <p className="text-xs text-gray-500 truncate">{subline}</p>}
                    </div>
                    {isAdded ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                        ✓ Already added
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(p.id)}
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
              onClick={handleAdd}
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
