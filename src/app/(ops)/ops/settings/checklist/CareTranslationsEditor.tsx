"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Languages } from "lucide-react";

type CareActionType = {
  id: string;
  name: string;
  display_name: string | null;
  display_name_hi: string | null;
  display_name_kn: string | null;
  needs_translation_review: boolean;
};

const inputCls =
  "w-full mt-1 px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest";

// Care-action display names + hi/kn translations. English display is admin-only;
// hi/kn are editable by admin + horti. (Frequency lives on the Care Actions
// settings page.) Rendered as a tab of the checklist settings page.
export default function CareTranslationsEditor({ role }: { role: string | null }) {
  const [types, setTypes] = useState<CareActionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | null>(null);
  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    const res = await fetch("/api/ops/care-action-types");
    const json = await res.json();
    if (res.ok) setTypes(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function needsTx(t: CareActionType): boolean {
    return t.needs_translation_review || !t.display_name_hi?.trim() || !t.display_name_kn?.trim();
  }

  function setField(id: string, field: keyof CareActionType, value: string) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  async function save(
    t: CareActionType,
    body: Record<string, unknown>,
    opts: { promptAfter?: boolean } = {}
  ) {
    setSavingId(t.id);
    const res = await fetch(`/api/ops/care-action-types/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSavingId(null);
    if (!res.ok) {
      alert(json.error ?? "Save failed");
      return;
    }
    await load();
    if (opts.promptAfter) setPromptId(t.id);
    else if (promptId === t.id) setPromptId(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-sage">
        {isAdmin
          ? "The care-action name gardeners see, with Hindi and Kannada translations. Visit frequency is edited under Care Actions."
          : "Edit the Hindi and Kannada names. Ask an admin to change the English name."}
      </p>

      {loading ? (
        <p className="text-sm text-sage py-8 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </p>
      ) : (
        types.map((t) => (
          <div key={t.id} className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-sage">{t.name}</span>
              {needsTx(t) && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-terra bg-terra/10 border border-terra/30 rounded-full px-2 py-0.5">
                  <Languages size={11} /> Needs translation
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-xs text-sage">English</span>
                <input
                  className={inputCls}
                  value={t.display_name ?? ""}
                  disabled={!isAdmin}
                  placeholder="—"
                  onChange={(e) => setField(t.id, "display_name", e.target.value)}
                  onBlur={() => {
                    if (isAdmin && (t.display_name ?? "").trim())
                      save(t, { display_name: t.display_name }, { promptAfter: true });
                  }}
                />
              </label>
              <label className="block">
                <span className="text-xs text-sage">हिंदी</span>
                <input
                  lang="hi"
                  className={inputCls}
                  value={t.display_name_hi ?? ""}
                  placeholder="—"
                  onChange={(e) => setField(t.id, "display_name_hi", e.target.value)}
                  onBlur={() => save(t, { display_name_hi: t.display_name_hi || null })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-sage">ಕನ್ನಡ</span>
                <input
                  lang="kn"
                  className={inputCls}
                  value={t.display_name_kn ?? ""}
                  placeholder="—"
                  onChange={(e) => setField(t.id, "display_name_kn", e.target.value)}
                  onBlur={() => save(t, { display_name_kn: t.display_name_kn || null })}
                />
              </label>
            </div>
            {promptId === t.id && needsTx(t) && (
              <p className="text-xs text-terra flex items-center gap-1">
                <Languages size={12} /> English changed — please update the Hindi and Kannada names
                above.
              </p>
            )}
            {savingId === t.id && (
              <p className="text-xs text-sage flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Saving…
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
