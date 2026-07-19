"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sprout, Package, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import PlantPicker, { type PlantPick } from "@/components/ops/PlantPicker";
import AccessoryPicker, { type AccessoryResult } from "@/components/ops/AccessoryPicker";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

type EditorItem = {
  key: string;
  kind: "plant" | "accessory";
  plant_id?: string; // uuid (existing)
  airtable_id?: string; // from PlantSelector (new)
  catalog_product_id?: string;
  name: string;
  price_band?: string | null;
  price_inr?: number | null;
  thumbnail?: string | null;
  quantity: string;
  note: string;
  why: string;
};

let keySeq = 0;
const nextKey = () => `k${keySeq++}`;

export default function TemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(templateId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"plants" | "accessories">("plants");
  const [items, setItems] = useState<EditorItem[]>([]);
  const [showPlantPicker, setShowPlantPicker] = useState(false);
  const [showAccessory, setShowAccessory] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) return;
    const res = await fetch(`/api/ops/curated-templates/${templateId}`);
    if (res.ok) {
      const json = await res.json();
      const t = json.data;
      setName(t.name ?? "");
      setDescription(t.description ?? "");
      setType(t.type === "accessories" ? "accessories" : "plants");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems((t.items ?? []).map((i: any) => {
        if (i.type === "accessory") {
          const cp = i.catalog_product;
          return {
            key: nextKey(),
            kind: "accessory" as const,
            catalog_product_id: i.catalog_product_id,
            name: cp?.name ?? "Accessory",
            price_inr: cp?.price_inr ?? null,
            thumbnail: cp?.thumbnail_storage_url || cp?.thumbnail_url || cp?.image_storage_url || cp?.image_url || null,
            quantity: i.quantity != null ? String(i.quantity) : "",
            note: i.note ?? "",
            why: i.why_picked_for_balcony ?? "",
          };
        }
        const p = i.plant;
        return {
          key: nextKey(),
          kind: "plant" as const,
          plant_id: i.plant_id,
          airtable_id: p?.airtable_id ?? undefined,
          name: p?.name ?? "Plant",
          price_band: p?.price_band ?? null,
          thumbnail: p?.thumbnail_storage_url || p?.thumbnail_url || null,
          quantity: i.quantity != null ? String(i.quantity) : "",
          note: i.note ?? "",
          why: i.why_picked_for_balcony ?? "",
        };
      }));
    } else {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to load template");
    }
    setLoading(false);
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  function patchItem(key: string, patch: Partial<EditorItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }
  function move(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function addPlants(picks: PlantPick[]) {
    setItems((prev) => {
      const existing = new Set(
        prev.filter((it) => it.kind === "plant").map((it) => it.airtable_id).filter(Boolean)
      );
      const additions = picks
        // Off-catalog custom entries (no airtable_id) can't persist to a template.
        .filter((p) => p.airtable_id && !existing.has(p.airtable_id))
        .map((p) => ({
          key: nextKey(),
          kind: "plant" as const,
          airtable_id: p.airtable_id!,
          name: p.name,
          price_band: p.price_band,
          quantity: "",
          note: "",
          why: "",
        }));
      return [...prev, ...additions];
    });
  }

  function addAccessories(products: AccessoryResult[]) {
    setItems((prev) => {
      const existing = new Set(prev.map((it) => it.catalog_product_id).filter(Boolean));
      const additions = products
        .filter((p) => !existing.has(p.id))
        .map((p) => ({
          key: nextKey(),
          kind: "accessory" as const,
          catalog_product_id: p.id,
          name: p.name,
          price_inr: p.price_inr,
          thumbnail: p.thumbnail_storage_url || p.thumbnail_url || p.image_storage_url || p.image_url || null,
          quantity: "",
          note: "",
          why: "",
        }));
      return [...prev, ...additions];
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const payloadItems = items.map((it, i) => {
      const q = parseInt(it.quantity, 10);
      const base = {
        quantity: isNaN(q) || q <= 0 ? null : q,
        note: it.note.trim() || null,
        why_picked_for_balcony: it.why.trim() || null,
        sort_order: i,
      };
      if (it.kind === "accessory") return { ...base, catalog_product_id: it.catalog_product_id };
      return { ...base, ...(it.plant_id ? { plant_id: it.plant_id } : { airtable_id: it.airtable_id }) };
    });

    const res = await fetch(
      isEdit ? `/api/ops/curated-templates/${templateId}` : "/api/ops/curated-templates",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, type, items: payloadItems }),
      }
    );
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to save template");
      return;
    }
    router.push("/ops/curated-templates");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-forest" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-32">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/ops/curated-templates")} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
            {isEdit ? "Edit template" : "New template"}
          </h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[820px] mx-auto">
        {error && <div className="bg-terra/5 border border-terra/30 rounded-xl p-3 text-sm text-terra">{error}</div>}

        {/* Details */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Template details</p>
          <div>
            <label className="block text-[11px] text-sage mb-1">Template type</label>
            <div className="flex gap-2">
              {(["plants", "accessories"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border capitalize ${
                    type === t ? "bg-forest text-offwhite border-forest" : "border-stone text-charcoal hover:bg-cream"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-sage mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Low-light balcony starter" className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-[11px] text-sage mb-1">Description <span className="text-stone">(optional)</span></label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this template is for…" className={`${INPUT_CLS} min-h-[44px]`} />
          </div>
        </div>

        {/* Add items — only the kind that matches the template type */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Add items</p>
          {type === "plants" ? (
            <button
              onClick={() => setShowPlantPicker(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream"
            >
              <Plus size={14} /> Add plants
            </button>
          ) : (
            <button
              onClick={() => setShowAccessory(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream"
            >
              <Plus size={14} /> Add accessory
            </button>
          )}
        </div>

        {/* Items list */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Items ({items.length})</p>
          {items.length === 0 ? (
            <p className="text-sm text-stone">No items yet. Add plants or accessories above.</p>
          ) : (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={it.key} className="border border-stone/40 rounded-xl p-2.5">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex gap-2.5 sm:w-[46%] sm:flex-shrink-0">
                      {it.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumbnail} alt={it.name} className="w-11 h-11 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {it.kind === "plant" ? <Sprout size={18} className="text-forest" /> : <Package size={18} className="text-forest" />}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-charcoal leading-tight truncate">{it.name}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-stone/20 text-sage uppercase tracking-wide flex-shrink-0">
                            {it.kind}
                          </span>
                        </div>
                        {it.kind === "plant" && it.price_band && <p className="text-[11px] text-sage">{it.price_band}</p>}
                        {it.kind === "accessory" && it.price_inr != null && (
                          <p className="text-[11px] text-sage">₹{it.price_inr.toLocaleString("en-IN")}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex items-center border border-stone rounded-lg overflow-hidden">
                            <button type="button" onClick={() => patchItem(it.key, { quantity: String(Math.max(0, (parseInt(it.quantity, 10) || 0) - 1) || "") })} className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-cream">−</button>
                            <input
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) => patchItem(it.key, { quantity: e.target.value })}
                              placeholder="—"
                              className="w-9 text-center text-sm text-charcoal bg-offwhite focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button type="button" onClick={() => patchItem(it.key, { quantity: String((parseInt(it.quantity, 10) || 0) + 1) })} className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-cream">+</button>
                          </div>
                          <div className="flex items-center gap-0.5 ml-auto">
                            <button onClick={() => move(it.key, -1)} disabled={idx === 0} className="p-1 text-stone hover:text-charcoal disabled:opacity-30" aria-label="Move up"><ChevronUp size={15} /></button>
                            <button onClick={() => move(it.key, 1)} disabled={idx === items.length - 1} className="p-1 text-stone hover:text-charcoal disabled:opacity-30" aria-label="Move down"><ChevronDown size={15} /></button>
                            <button onClick={() => removeItem(it.key)} className="p-1 text-stone hover:text-terra" aria-label="Remove"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <input value={it.note} onChange={(e) => patchItem(it.key, { note: e.target.value })} placeholder="Note (optional)" className={`${INPUT_CLS} py-1.5`} />
                      <input value={it.why} onChange={(e) => patchItem(it.key, { why: e.target.value })} placeholder="Why picked for balcony (optional)" className={`${INPUT_CLS} py-1.5`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-offwhite border-t border-stone p-4">
        <div className="max-w-[820px] mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.push("/ops/curated-templates")} className="px-4 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? "Save changes" : "Create template"}
          </button>
        </div>
      </div>

      {showPlantPicker && (
        <PlantPicker
          alreadyAddedIds={
            new Set(
              items
                .filter((i) => i.kind === "plant")
                .map((i) => i.airtable_id)
                .filter((x): x is string => Boolean(x))
            )
          }
          onAdd={addPlants}
          onClose={() => setShowPlantPicker(false)}
        />
      )}

      {showAccessory && (
        <AccessoryPicker
          alreadyAddedIds={new Set(items.filter((i) => i.catalog_product_id).map((i) => i.catalog_product_id as string))}
          onAdd={addAccessories}
          onClose={() => setShowAccessory(false)}
        />
      )}
    </div>
  );
}
