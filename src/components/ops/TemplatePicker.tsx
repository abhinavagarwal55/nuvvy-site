"use client";

import { useEffect, useState } from "react";
import { Search, X, Loader2, ListChecks } from "lucide-react";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  item_names: string[];
};

/**
 * Modal picker of ACTIVE curated-list templates. Selecting one calls onSelect
 * with the template id (the caller performs the apply).
 */
export default function TemplatePicker({
  onSelect,
  onClose,
  applyingId,
  type,
}: {
  onSelect: (templateId: string) => void;
  onClose: () => void;
  applyingId: string | null;
  // When set, only templates of this kind are shown.
  type?: "plants" | "accessories";
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const params = new URLSearchParams({ status: "active" });
      if (qDebounced) params.set("q", qDebounced);
      if (type) params.set("type", type);
      try {
        const res = await fetch(`/api/ops/curated-templates?${params.toString()}`);
        const json = await res.json();
        if (!cancelled) setRows(json.data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [qDebounced, type]);

  return (
    <div className="fixed inset-0 bg-charcoal/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-offwhite rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col mb-16 md:mb-0">
        <div className="px-5 py-4 border-b border-stone flex items-center justify-between">
          <h2 className="text-lg text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
            Add from template
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
              placeholder="Search templates…"
              className="w-full pl-8 pr-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="text-sm text-sage text-center py-8">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-sage">
              <ListChecks size={24} className="mx-auto mb-2 text-stone" />
              <p className="text-sm">No active templates.</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone/30">
              {rows.map((t) => (
                <li key={t.id}>
                  <button
                    disabled={applyingId !== null}
                    onClick={() => onSelect(t.id)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-lg hover:bg-cream disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-charcoal truncate">{t.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone/20 text-sage whitespace-nowrap flex-shrink-0">
                          {t.item_count} item{t.item_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      {t.description && <p className="text-xs text-sage truncate">{t.description}</p>}
                      {t.item_names.length > 0 && (
                        <p className="text-[11px] text-sage mt-0.5 truncate">{t.item_names.join(", ")}</p>
                      )}
                    </div>
                    {applyingId === t.id && <Loader2 size={16} className="animate-spin text-forest flex-shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
