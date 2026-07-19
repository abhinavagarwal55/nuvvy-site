"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { PLANT_CATEGORIES, LIGHT_CONDITIONS, PRICE_BANDS } from "@/config/plantOptions";

export type PlantResult = {
  airtable_id: string;
  name: string;
  scientific_name: string | null;
  category: string | null;
  light: string | null;
  price_band: string | null;
  thumbnail_storage_url: string | null;
};

// What the picker hands back on "Add": catalog plants (airtable_id) or a
// free-text custom entry (airtable_id = null), matching PlantSelector.
export type PlantPick = {
  airtable_id: string | null;
  name: string;
  price_band: string | null;
};

/**
 * Ops-styled, filtered, multi-select plant picker — parity with the legacy
 * /internal/shortlists plant picker: search (name/scientific), single-select
 * Category + Light (raw values), multi-select Price Band (+ "Not Set"), plus a
 * free-text custom-entry escape hatch. Adds several plants to a section at once.
 */
export default function PlantPicker({
  alreadyAddedIds,
  onAdd,
  onClose,
}: {
  alreadyAddedIds: Set<string>;
  onAdd: (picks: PlantPick[]) => void;
  onClose: () => void;
}) {
  const [plants, setPlants] = useState<PlantResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lightFilter, setLightFilter] = useState<string[]>([]);
  const [priceBandFilter, setPriceBandFilter] = useState<string[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ops/plants/search`);
        const json = await res.json();
        if (!cancelled) setPlants(json.data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side filtering — matches the legacy new/page.tsx logic exactly.
  const filtered = useMemo(() => {
    let list = plants;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.scientific_name != null && p.scientific_name.toLowerCase().includes(q))
      );
    }
    if (categoryFilter !== "all") list = list.filter((p) => p.category === categoryFilter);
    if (lightFilter.length > 0) list = list.filter((p) => p.light != null && lightFilter.includes(p.light));
    if (priceBandFilter.length > 0) {
      list = list.filter((p) => {
        const isNotSet = !p.price_band || p.price_band.trim() === "";
        if (priceBandFilter.includes("not-set") && isNotSet) return true;
        return priceBandFilter.includes(p.price_band || "");
      });
    }
    return list;
  }, [plants, search, categoryFilter, lightFilter, priceBandFilter]);

  function toggle(id: string) {
    if (alreadyAddedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePriceBand(band: string) {
    setPriceBandFilter((prev) => (prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band]));
  }

  function toggleLight(l: string) {
    setLightFilter((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  }

  const trimmed = search.trim();
  const hasExactName = plants.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const canCustom = trimmed.length > 0 && !hasExactName;

  function handleAdd() {
    const picks: PlantPick[] = [];
    for (const p of filtered) {
      if (selected.has(p.airtable_id) && !alreadyAddedIds.has(p.airtable_id)) {
        picks.push({ airtable_id: p.airtable_id, name: p.name, price_band: p.price_band });
      }
    }
    if (picks.length === 0) return;
    onAdd(picks);
    onClose();
  }

  function handleAddCustom() {
    if (!canCustom) return;
    onAdd([{ airtable_id: null, name: trimmed, price_band: null }]);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-charcoal/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-offwhite rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col mb-16 md:mb-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone flex items-center justify-between">
          <h2 className="text-lg text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
            Add plants
          </h2>
          <button onClick={onClose} className="text-stone hover:text-charcoal" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-stone space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-sage" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or scientific name…"
              className="w-full pl-8 pr-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
            />
          </div>
          <div className="sm:max-w-[50%]">
            <label className="block text-[10px] text-sage uppercase tracking-widest mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest"
            >
              <option value="all">All</option>
              {PLANT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-sage uppercase tracking-widest mb-1">Light</label>
            <div className="flex flex-wrap gap-1.5">
              {LIGHT_CONDITIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggleLight(l)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    lightFilter.includes(l)
                      ? "bg-forest text-offwhite border-forest"
                      : "border-stone text-charcoal hover:bg-cream"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-sage uppercase tracking-widest mb-1">Price band</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => togglePriceBand("not-set")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  priceBandFilter.includes("not-set")
                    ? "bg-forest text-offwhite border-forest"
                    : "border-stone text-charcoal hover:bg-cream"
                }`}
              >
                Not Set
              </button>
              {PRICE_BANDS.map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => togglePriceBand(band)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    priceBandFilter.includes(band)
                      ? "bg-forest text-offwhite border-forest"
                      : "border-stone text-charcoal hover:bg-cream"
                  }`}
                >
                  {band.replace("INR ", "₹")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result count */}
        {!loading && (
          <div className="px-5 py-1.5 border-b border-stone/40 text-[11px] text-sage flex items-center justify-between">
            <span>
              {filtered.length} plant{filtered.length === 1 ? "" : "s"}
            </span>
            {selected.size > 0 && <span className="text-forest font-medium">{selected.size} selected</span>}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="text-sm text-sage text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-sage">No plants match these filters.</p>
              {canCustom && (
                <button onClick={handleAddCustom} className="text-xs text-forest hover:text-garden font-medium">
                  Use &ldquo;{trimmed}&rdquo; as a custom entry
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-stone/30">
              {filtered.map((p) => {
                const isAdded = alreadyAddedIds.has(p.airtable_id);
                const isSelected = selected.has(p.airtable_id);
                return (
                  <li key={p.airtable_id}>
                    <button
                      disabled={isAdded}
                      onClick={() => toggle(p.airtable_id)}
                      className={`w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg ${
                        isAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-cream"
                      }`}
                    >
                      {p.thumbnail_storage_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail_storage_url} alt={p.name} className="w-11 h-11 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-cream border border-stone/40 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal truncate">{p.name}</p>
                        <p className="text-xs text-sage truncate">
                          {p.scientific_name ? <span className="italic">{p.scientific_name}</span> : null}
                          {p.scientific_name && (p.category || p.light || p.price_band) ? " · " : ""}
                          {[p.category, p.light, p.price_band].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {isAdded ? (
                        <span className="text-[11px] text-forest whitespace-nowrap flex-shrink-0">✓ Added</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 accent-forest flex-shrink-0"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && filtered.length > 0 && canCustom && (
            <button onClick={handleAddCustom} className="w-full text-left px-2 py-2 text-xs text-forest hover:bg-cream rounded-lg border-t border-stone/30 mt-1">
              Use &ldquo;{trimmed}&rdquo; as a custom entry
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-3 py-2 text-sm border border-stone rounded-xl text-charcoal hover:bg-cream">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="px-4 py-2 text-sm font-medium bg-forest text-offwhite rounded-xl hover:bg-garden disabled:opacity-40"
          >
            Add {selected.size || ""} plant{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
