"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

export type AccessoryResult = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  price_inr: number | null;
  thumbnail_storage_url: string | null;
  thumbnail_url: string | null;
  image_storage_url: string | null;
  image_url: string | null;
};

function bestThumb(p: AccessoryResult): string | null {
  return p.thumbnail_storage_url || p.thumbnail_url || p.image_storage_url || p.image_url || null;
}

/**
 * Ops-styled accessory picker modal. Reuses the existing ops-auth accessory
 * search endpoint. Single-select: clicking a row calls onSelect and closes.
 */
export default function AccessoryPicker({
  alreadyAddedIds,
  onSelect,
  onClose,
}: {
  alreadyAddedIds: Set<string>;
  onSelect: (product: AccessoryResult) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [results, setResults] = useState<AccessoryResult[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, [qDebounced]);

  return (
    <div className="fixed inset-0 bg-charcoal/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-offwhite rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mb-16 md:mb-0">
        <div className="px-5 py-4 border-b border-stone flex items-center justify-between">
          <h2 className="text-lg text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
            Add accessory
          </h2>
          <button onClick={onClose} className="text-stone hover:text-charcoal" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-stone">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-sage" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, brand, ASIN…"
              className="w-full pl-8 pr-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="text-sm text-sage text-center py-8">Loading…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-sage text-center py-8">No accessories match.</p>
          ) : (
            <ul className="divide-y divide-stone/30">
              {results.map((p) => {
                const isAdded = alreadyAddedIds.has(p.id);
                const thumb = bestThumb(p);
                return (
                  <li key={p.id}>
                    <button
                      disabled={isAdded}
                      onClick={() => {
                        onSelect(p);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg ${
                        isAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-cream"
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={p.name} className="w-11 h-11 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-cream border border-stone/40 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal truncate">{p.name}</p>
                        <p className="text-xs text-sage truncate">
                          {p.brand ? `${p.brand} · ` : ""}
                          {p.category}
                          {p.price_inr != null ? ` · ₹${p.price_inr.toLocaleString("en-IN")}` : ""}
                        </p>
                      </div>
                      {isAdded && <span className="text-[11px] text-forest whitespace-nowrap">✓ Added</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
