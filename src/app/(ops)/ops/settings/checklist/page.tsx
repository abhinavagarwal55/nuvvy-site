"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Languages,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  label_hi: string | null;
  label_kn: string | null;
  is_required: boolean;
  is_active: boolean;
  order_index: number;
  needs_translation_review: boolean;
};

const inputCls =
  "w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

// A row needs translation when a variant is missing OR the row is flagged for
// review (English changed since the last translation save). PRD D4.
function needsTranslation(item: Item): boolean {
  return item.needs_translation_review || !item.label_hi?.trim() || !item.label_kn?.trim();
}

export default function ChecklistSettingsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row "update translations now" prompt after an English save.
  const [promptId, setPromptId] = useState<string | null>(null);

  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    const res = await fetch("/api/ops/checklist-template-items");
    const json = await res.json();
    if (res.ok) setItems(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/ops/whoami")
      .then((r) => r.json())
      .then((j) => setRole(j.data?.role ?? null))
      .catch(() => {});
    load();
  }, [load]);

  function setField(id: string, field: keyof Item, value: string | boolean) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }

  async function saveField(
    item: Item,
    body: Record<string, unknown>,
    opts: { promptAfter?: boolean } = {}
  ) {
    setSavingId(item.id);
    setError(null);
    const res = await fetch("/api/ops/checklist-template-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, ...body }),
    });
    const json = await res.json();
    setSavingId(null);
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    await load();
    if (opts.promptAfter) setPromptId(item.id);
    else if (promptId === item.id) setPromptId(null);
  }

  async function addItem() {
    if (!newLabel.trim()) return;
    setAdding(true);
    setError(null);
    const res = await fetch("/api/ops/checklist-template-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    const json = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(json.error ?? "Add failed");
      return;
    }
    setNewLabel("");
    await load();
  }

  async function softDelete(item: Item) {
    if (!confirm(`Remove "${item.label}" from the checklist? It can be re-added later.`)) return;
    setSavingId(item.id);
    const res = await fetch(`/api/ops/checklist-template-items?id=${item.id}`, {
      method: "DELETE",
    });
    setSavingId(null);
    if (res.ok) await load();
  }

  async function reorder(item: Item, direction: "up" | "down") {
    await saveField(item, { direction });
  }

  const active = items.filter((i) => i.is_active);

  return (
    <div className="min-h-screen bg-cream pb-24 md:pl-56">
      <div className="bg-offwhite border-b border-stone px-4 md:px-8 pt-6 pb-4 sticky top-0 z-10">
        <Link href="/ops/settings" className="inline-flex items-center gap-1 text-sm text-sage mb-2">
          <ArrowLeft size={14} /> Settings
        </Link>
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Service Checklist
        </h1>
        <p className="text-sm text-sage mt-1">
          {isAdmin
            ? "Add, reorder, and edit checklist items and their translations."
            : "Edit the Hindi and Kannada translations. Ask an admin to change the English text or order."}
        </p>
      </div>

      <div className="px-4 md:px-8 pt-6 max-w-[900px] space-y-3">
        {error && (
          <p className="text-sm text-terra bg-terra/10 border border-terra/30 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-sage py-8 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        ) : (
          active.map((item, idx) => (
            <div
              key={item.id}
              className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {needsTranslation(item) && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-terra bg-terra/10 border border-terra/30 rounded-full px-2 py-0.5">
                      <Languages size={11} /> Needs translation
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => reorder(item, "up")}
                      disabled={idx === 0 || savingId === item.id}
                      className="p-1.5 rounded-lg border border-stone text-charcoal disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => reorder(item, "down")}
                      disabled={idx === active.length - 1 || savingId === item.id}
                      className="p-1.5 rounded-lg border border-stone text-charcoal disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => softDelete(item)}
                      disabled={savingId === item.id}
                      className="p-1.5 rounded-lg border border-terra/40 text-terra"
                      aria-label="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {/* English (admin editable) */}
                <label className="block">
                  <span className="text-xs text-sage">English</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={item.label}
                    disabled={!isAdmin}
                    onChange={(e) => setField(item.id, "label", e.target.value)}
                    onBlur={() => {
                      if (isAdmin) saveField(item, { label: item.label }, { promptAfter: true });
                    }}
                  />
                </label>
                {/* Hindi */}
                <label className="block">
                  <span className="text-xs text-sage">हिंदी</span>
                  <input
                    className={`${inputCls} mt-1`}
                    lang="hi"
                    value={item.label_hi ?? ""}
                    placeholder="—"
                    onChange={(e) => setField(item.id, "label_hi", e.target.value)}
                    onBlur={() => saveField(item, { label_hi: item.label_hi || null })}
                  />
                </label>
                {/* Kannada */}
                <label className="block">
                  <span className="text-xs text-sage">ಕನ್ನಡ</span>
                  <input
                    className={`${inputCls} mt-1`}
                    lang="kn"
                    value={item.label_kn ?? ""}
                    placeholder="—"
                    onChange={(e) => setField(item.id, "label_kn", e.target.value)}
                    onBlur={() => saveField(item, { label_kn: item.label_kn || null })}
                  />
                </label>
              </div>

              {promptId === item.id && needsTranslation(item) && (
                <p className="text-xs text-terra flex items-center gap-1">
                  <Languages size={12} /> English changed — please update the Hindi and Kannada
                  translations above.
                </p>
              )}
              {savingId === item.id && (
                <p className="text-xs text-sage flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Saving…
                </p>
              )}
            </div>
          ))
        )}

        {/* Add (admin only) */}
        {isAdmin && !loading && (
          <div className="bg-offwhite rounded-2xl border border-dashed border-stone px-4 py-4 flex items-center gap-2">
            <input
              className={inputCls}
              placeholder="New checklist item (English)…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <button
              onClick={addItem}
              disabled={adding || !newLabel.trim()}
              className="inline-flex items-center gap-1 bg-forest text-offwhite rounded-xl px-3 py-2 text-sm disabled:opacity-40"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
