"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

type PlantResult = {
  airtable_id: string;
  name: string;
  thumbnail_storage_url: string | null;
  price_band: string | null;
};

type SelectedPlant = {
  plant_id: string | null;
  plant_name: string;
  price_band: string | null;
};

export default function PlantSelector({
  value,
  onChange,
}: {
  value: SelectedPlant | null;
  onChange: (plant: SelectedPlant | null) => void;
}) {
  const [query, setQuery] = useState(value?.plant_name ?? "");
  const [results, setResults] = useState<PlantResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearch(q: string) {
    setQuery(q);
    if (value) onChange(null); // clear selection when typing

    clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ops/plants/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 250);
  }

  function selectPlant(plant: PlantResult) {
    setQuery(plant.name);
    onChange({
      plant_id: plant.airtable_id,
      plant_name: plant.name,
      price_band: plant.price_band,
    });
    setOpen(false);
  }

  function selectFreeText() {
    if (query.trim()) {
      onChange({
        plant_id: null,
        plant_name: query.trim(),
        price_band: null,
      });
      setOpen(false);
    }
  }

  function clear() {
    setQuery("");
    onChange(null);
    setResults([]);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-3 text-sage" />
        <input
          className="w-full pl-8 pr-8 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search plant catalog…"
        />
        {query && (
          <button onClick={clear} className="absolute right-3 top-3 text-stone hover:text-charcoal">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Selected indicator */}
      {value && (
        <p className="text-xs text-forest mt-1">
          {value.plant_id ? "✓ From catalog" : "✓ Custom entry"}
          {value.price_band && ` · ${value.price_band}`}
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-offwhite border border-stone rounded-xl shadow-lg max-h-[240px] overflow-y-auto">
          {loading && (
            <p className="px-3 py-2 text-xs text-sage">Searching…</p>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2">
              <p className="text-xs text-sage mb-1">No plants found in catalog</p>
              <button
                onClick={selectFreeText}
                className="text-xs text-forest hover:text-garden font-medium"
              >
                Use &quot;{query}&quot; as custom entry
              </button>
            </div>
          )}

          {results.map((plant) => (
            <button
              key={plant.airtable_id}
              onClick={() => selectPlant(plant)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-cream text-left border-b border-stone/20 last:border-0"
            >
              {plant.thumbnail_storage_url ? (
                <img
                  src={plant.thumbnail_storage_url}
                  alt={plant.name}
                  className="w-8 h-8 rounded-lg object-cover border border-stone/40 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-cream border border-stone/40 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-charcoal truncate">{plant.name}</p>
                {plant.price_band && (
                  <p className="text-xs text-sage">{plant.price_band}</p>
                )}
              </div>
            </button>
          ))}

          {!loading && results.length > 0 && query.trim() && (
            <button
              onClick={selectFreeText}
              className="w-full px-3 py-2 text-xs text-forest hover:bg-cream text-left border-t border-stone/30"
            >
              Use &quot;{query}&quot; as custom entry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
