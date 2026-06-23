"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, Copy, Check, Pencil, Loader2, RotateCcw } from "lucide-react";
import { formatTime12 } from "@/lib/reminders/template";

type ReminderRow = {
  id: string;
  customer_name: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  day_label: string;
  draft_message: string;
  saved_message: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function RemindersPage() {
  const today = useMemo(() => new Date(), []);
  const dateFrom = localDate(today);
  const dateTo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 6);
    return localDate(d);
  }, [today]);

  const listKey = `/api/ops/schedule/reminders?date_from=${dateFrom}&date_to=${dateTo}`;
  const { data, isLoading, mutate } = useSWR(listKey, fetcher);

  // role (to show the admin-only template editor)
  const { data: roleData } = useSWR("/api/ops/people/me/role", fetcher);
  const isAdmin = roleData?.data?.role === "admin";

  const grouped = useMemo(() => {
    const rows: ReminderRow[] = data?.data ?? [];
    const map = new Map<string, ReminderRow[]>();
    for (const r of rows) {
      const arr = map.get(r.scheduled_date) ?? [];
      arr.push(r);
      map.set(r.scheduled_date, arr);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/ops/schedule" className="p-1 text-charcoal hover:text-forest">
            <ChevronLeft size={20} />
          </Link>
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Visit Reminders
          </h1>
        </div>
        <p className="text-sm text-sage mt-1">
          Next 7 days. Edit a message if needed, then copy and paste into WhatsApp.
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-6">
        {isAdmin && <TemplateEditor onSaved={() => mutate()} />}

        {isLoading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-sage text-center py-10">
            No upcoming visits in the next 7 days.
          </p>
        ) : (
          grouped.map(([date, dayRows]) => {
            const longDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            return (
              <div key={date}>
                <h2 className="text-sm font-medium text-charcoal mb-2">
                  <span className="text-forest">{dayRows[0].day_label}</span>
                  <span className="text-sage"> · {longDate}</span>
                </h2>
                <div className="space-y-3">
                  {dayRows.map((r) => (
                    <ReminderCard key={r.id} row={r} onChanged={() => mutate()} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---- Per-visit reminder card (edit + save) ---- */
function ReminderCard({ row, onChanged }: { row: ReminderRow; onChanged: () => void }) {
  const baseline = row.saved_message ?? row.draft_message;
  const [value, setValue] = useState(baseline);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const time =
    row.time_window_start && row.time_window_end
      ? `${formatTime12(row.time_window_start)} – ${formatTime12(row.time_window_end)}`
      : "Time not set";

  const dirty = value !== baseline;
  const hasOverride = row.saved_message != null;

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/ops/schedule/reminders/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: value }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to save");
      return;
    }
    onChanged();
  }

  async function reset() {
    setResetting(true);
    setError(null);
    const res = await fetch(`/api/ops/schedule/reminders/${row.id}`, { method: "DELETE" });
    setResetting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to reset");
      return;
    }
    setValue(row.draft_message);
    onChanged();
  }

  return (
    <div className="bg-offwhite border border-stone/60 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-charcoal flex items-center gap-2">
            {row.customer_name}
            {hasOverride && (
              <span className="text-[10px] uppercase tracking-wide text-forest bg-forest/10 px-1.5 py-0.5 rounded">
                Edited
              </span>
            )}
          </p>
          <p className="text-xs text-sage">{time}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !dirty || !value.trim()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-forest text-offwhite hover:bg-garden disabled:opacity-40 disabled:hover:bg-forest transition-colors"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={copy}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
              copied
                ? "bg-forest/10 text-forest"
                : "border border-stone text-charcoal hover:bg-cream"
            }`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <textarea
        className="w-full text-sm text-charcoal bg-cream border border-stone rounded-lg p-2.5 resize-y focus:outline-none focus:border-forest"
        rows={9}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center gap-3 mt-1.5 min-h-[1.25rem]">
        {hasOverride && (
          <button
            onClick={reset}
            disabled={resetting}
            className="flex items-center gap-1 text-xs text-sage hover:text-charcoal disabled:opacity-50"
          >
            {resetting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Reset to template
          </button>
        )}
        {error && <span className="text-xs text-terra">{error}</span>}
      </div>
    </div>
  );
}

/* ---- Admin-only template editor (collapsible) ---- */
function TemplateEditor({ onSaved }: { onSaved: () => void }) {
  const cfgKey = "/api/ops/system-config/reminder-template";
  const { data, mutate } = useSWR(cfgKey, fetcher);
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [standard, setStandard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tplValue = template ?? data?.data?.template ?? "";
  const stdValue = standard ?? data?.data?.standard_lines ?? "";

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(cfgKey, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: tplValue, standard_lines: stdValue }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(json.error ?? "Failed to save");
      return;
    }
    setMsg("Saved. Drafts updated.");
    await mutate();
    onSaved();
  }

  return (
    <div className="bg-offwhite border border-stone/60 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-charcoal"
      >
        <Pencil size={15} className="text-sage" />
        Edit message template
        <span className="ml-auto text-xs text-sage">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-stone/50 pt-3">
          <div>
            <label className="block text-xs text-sage mb-1">Template</label>
            <textarea
              className="w-full text-sm text-charcoal bg-cream border border-stone rounded-lg p-2.5 resize-y focus:outline-none focus:border-forest font-mono"
              rows={10}
              value={tplValue}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="text-[11px] text-sage mt-1">
              Tokens: <code>{"{customer_name}"}</code> <code>{"{day}"}</code>{" "}
              <code>{"{time_window}"}</code> <code>{"{focus_items}"}</code>. Unknown tokens stay
              visible in the draft so you can spot typos.
            </p>
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">
              Standard maintenance lines (one per line)
            </label>
            <textarea
              className="w-full text-sm text-charcoal bg-cream border border-stone rounded-lg p-2.5 resize-y focus:outline-none focus:border-forest"
              rows={3}
              value={stdValue}
              onChange={(e) => setStandard(e.target.value)}
            />
            <p className="text-[11px] text-sage mt-1">
              Appended after care actions &amp; special tasks in the numbered list.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !tplValue.trim()}
              className="bg-forest text-offwhite text-sm px-4 py-2 rounded-lg hover:bg-garden disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving…" : "Save template"}
            </button>
            {msg && <span className="text-xs text-sage">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
