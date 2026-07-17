"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search, Loader2, Pencil, Trash2, RotateCcw, ListChecks } from "lucide-react";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  item_count: number;
  item_names: string[];
  updated_at: string;
};

export default function CuratedTemplatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("status", showInactive ? "inactive" : "active");
    const res = await fetch(`/api/ops/curated-templates?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
    }
    setLoading(false);
  }, [q, showInactive]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function setStatus(id: string, status: "active" | "inactive") {
    if (status === "inactive" && !confirm("Deactivate this template? It won't appear in the picker anymore. Lists already built from it are unaffected.")) {
      return;
    }
    setBusyId(id);
    const res = await fetch(`/api/ops/curated-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed to update template");
      return;
    }
    load();
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/ops/plant-orders")} className="text-charcoal hover:text-forest">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
              Curated Templates
            </h1>
          </div>
          <button
            onClick={() => router.push("/ops/curated-templates/new")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest text-offwhite text-xs font-medium rounded-full hover:bg-garden transition-colors"
          >
            <Plus size={14} /> New template
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-3 text-sage" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates by name…"
              className="w-full pl-8 pr-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-charcoal whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="w-4 h-4 accent-forest" />
            Show inactive
          </label>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-[900px] mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-forest" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-sage">
            <ListChecks size={28} className="mx-auto mb-2 text-stone" />
            <p className="text-sm">{showInactive ? "No inactive templates." : "No templates yet. Create one to reuse across curated lists."}</p>
          </div>
        ) : (
          <div className="bg-offwhite rounded-2xl border border-stone/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone/60 bg-cream/40">
                    <th className="px-4 py-2.5 text-[11px] font-medium text-sage uppercase tracking-widest">Template</th>
                    <th className="px-4 py-2.5 text-[11px] font-medium text-sage uppercase tracking-widest">Items</th>
                    <th className="px-4 py-2.5 text-[11px] font-medium text-sage uppercase tracking-widest whitespace-nowrap">Count</th>
                    <th className="px-4 py-2.5 text-[11px] font-medium text-sage uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-stone/30 last:border-0 align-top">
                      <td className="px-4 py-3 min-w-[180px]">
                        <p className="text-sm font-medium text-charcoal">{t.name}</p>
                        {t.description && <p className="text-xs text-sage">{t.description}</p>}
                        {t.status === "inactive" && <p className="text-[11px] text-terra mt-0.5">inactive</p>}
                      </td>
                      <td className="px-4 py-3">
                        {t.item_names.length === 0 ? (
                          <span className="text-xs text-stone">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {t.item_names.map((n, i) => (
                              <span key={i} className="text-xs text-charcoal bg-cream border border-stone/50 rounded-md px-2 py-0.5">
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-charcoal whitespace-nowrap">{t.item_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {t.status === "active" ? (
                            <>
                              <button
                                onClick={() => router.push(`/ops/curated-templates/${t.id}`)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-stone text-charcoal text-xs font-medium rounded-xl hover:bg-cream whitespace-nowrap"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                onClick={() => setStatus(t.id, "inactive")}
                                disabled={busyId === t.id}
                                className="p-1.5 text-stone hover:text-terra disabled:opacity-40"
                                aria-label="Deactivate"
                              >
                                {busyId === t.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setStatus(t.id, "active")}
                              disabled={busyId === t.id}
                              className="flex items-center gap-1 px-3 py-1.5 border border-stone text-charcoal text-xs font-medium rounded-xl hover:bg-cream disabled:opacity-40 whitespace-nowrap"
                            >
                              {busyId === t.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
