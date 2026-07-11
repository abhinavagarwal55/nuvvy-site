"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Languages } from "lucide-react";

type Guideline = {
  id: string;
  kind: "do" | "dont";
  text: string;
  text_hi: string | null;
  text_kn: string | null;
  translation_status: "pending" | "done" | "failed";
  order_index: number;
  is_active: boolean;
};

const inputCls =
  "w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

// Edits the gardener Do's / Don'ts. English is AI-translated on save; hi/kn are
// also directly editable (admin + horti). Rendered as a tab of the checklist
// settings page.
export default function GuidelinesEditor({ role }: { role: string | null }) {
  const [items, setItems] = useState<Guideline[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newKind, setNewKind] = useState<"do" | "dont">("do");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    const res = await fetch("/api/ops/guidelines?all=1");
    const json = await res.json();
    if (res.ok) setItems((json.data ?? []).filter((g: Guideline) => g.is_active));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setField(id: string, field: keyof Guideline, value: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }

  async function save(item: Guideline, body: Record<string, unknown>) {
    setSavingId(item.id);
    setError(null);
    const res = await fetch("/api/ops/guidelines", {
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
  }

  async function addItem() {
    if (!newText.trim()) return;
    setAdding(true);
    setError(null);
    const res = await fetch("/api/ops/guidelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: newKind, text: newText.trim() }),
    });
    const json = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(json.error ?? "Add failed");
      return;
    }
    setNewText("");
    await load();
  }

  async function softDelete(item: Guideline) {
    if (!confirm(`Remove this guideline? It can be re-added later.`)) return;
    setSavingId(item.id);
    const res = await fetch(`/api/ops/guidelines?id=${item.id}`, { method: "DELETE" });
    setSavingId(null);
    if (res.ok) await load();
  }

  function renderGroup(kind: "do" | "dont", label: string, accent: string) {
    const group = items.filter((g) => g.kind === kind);
    return (
      <section>
        <h2 className={`text-sm font-medium uppercase tracking-wide ${accent} mb-2`}>{label}</h2>
        <div className="space-y-3">
          {group.map((item, idx) => (
            <div key={item.id} className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {item.translation_status === "failed" ? (
                  <span className="text-[10px] uppercase tracking-wide text-terra bg-terra/10 border border-terra/30 rounded-full px-2 py-0.5">
                    Translation failed — edit hi/kn manually
                  </span>
                ) : item.translation_status === "pending" ? (
                  <span className="text-[10px] uppercase tracking-wide text-sage bg-sage/10 border border-sage/30 rounded-full px-2 py-0.5">
                    Translating…
                  </span>
                ) : (
                  <span />
                )}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => save(item, { direction: "up" })}
                      disabled={idx === 0 || savingId === item.id}
                      className="p-1.5 rounded-lg border border-stone text-charcoal disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => save(item, { direction: "down" })}
                      disabled={idx === group.length - 1 || savingId === item.id}
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
                <label className="block">
                  <span className="text-xs text-sage">English</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={item.text}
                    disabled={!isAdmin}
                    onChange={(e) => setField(item.id, "text", e.target.value)}
                    onBlur={() => {
                      if (isAdmin && item.text.trim()) save(item, { text: item.text });
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-sage">हिंदी</span>
                  <input
                    lang="hi"
                    className={`${inputCls} mt-1`}
                    value={item.text_hi ?? ""}
                    placeholder="—"
                    onChange={(e) => setField(item.id, "text_hi", e.target.value)}
                    onBlur={() => save(item, { text_hi: item.text_hi || null })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-sage">ಕನ್ನಡ</span>
                  <input
                    lang="kn"
                    className={`${inputCls} mt-1`}
                    value={item.text_kn ?? ""}
                    placeholder="—"
                    onChange={(e) => setField(item.id, "text_kn", e.target.value)}
                    onBlur={() => save(item, { text_kn: item.text_kn || null })}
                  />
                </label>
              </div>
              {savingId === item.id && (
                <p className="text-xs text-sage flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Saving…
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-sage flex items-center gap-1">
        <Languages size={13} />
        {isAdmin
          ? "The Do's & Don'ts gardeners see. English is auto-translated to Hindi & Kannada on save; edit any translation to override."
          : "Edit the Hindi and Kannada translations. Ask an admin to change the English text or order."}
      </p>
      {error && (
        <p className="text-sm text-terra bg-terra/10 border border-terra/30 rounded-xl px-3 py-2">{error}</p>
      )}
      {loading ? (
        <p className="text-sm text-sage py-8 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </p>
      ) : (
        <>
          {renderGroup("do", "Do's", "text-forest")}
          {renderGroup("dont", "Don'ts", "text-terra")}
          {isAdmin && (
            <div className="bg-offwhite rounded-2xl border border-dashed border-stone px-4 py-4 flex items-center gap-2">
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as "do" | "dont")}
                className="px-2 py-2 border border-stone rounded-xl text-sm bg-offwhite text-charcoal"
              >
                <option value="do">Do</option>
                <option value="dont">Don&apos;t</option>
              </select>
              <input
                className={inputCls}
                placeholder="New guideline (English)…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
              />
              <button
                onClick={addItem}
                disabled={adding || !newText.trim()}
                className="inline-flex items-center gap-1 bg-forest text-offwhite rounded-xl px-3 py-2 text-sm disabled:opacity-40"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
