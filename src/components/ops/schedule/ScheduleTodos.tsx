"use client";

import { useState } from "react";
import useSWR from "swr";
import { Square, CheckSquare, X, ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";

type Todo = {
  id: string;
  text: string;
  status: "open" | "done";
  created_by_name: string;
  created_at: string;
  completed_by_name: string | null;
  completed_at: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ScheduleTodos() {
  // Role gate — gardeners never see the card (API also enforces 403).
  const { data: roleData, isLoading: roleLoading } = useSWR("/api/ops/people/me/role", fetcher);
  const role = roleData?.data?.role ?? roleData?.role ?? null;
  const canUse = role === "admin" || role === "horticulturist";

  const listKey = "/api/ops/schedule/todos";
  // Only fetch once we know the user may use it — gardeners never hit the endpoint.
  const { data, mutate } = useSWR(canUse ? listKey : null, fetcher);

  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  if (roleLoading || !canUse) return null;

  const items: Todo[] = data?.data ?? [];
  const open = items.filter((t) => t.status === "open");
  const done = items.filter((t) => t.status === "done");

  const setBusyId = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function add() {
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    setError(null);
    const res = await fetch(listKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    setAdding(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to add");
      return;
    }
    setText("");
    mutate();
  }

  async function toggle(t: Todo) {
    if (busy.has(t.id)) return;
    setBusyId(t.id, true);
    const res = await fetch(`${listKey}/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: t.status === "done" ? "open" : "done" }),
    });
    setBusyId(t.id, false);
    if (res.ok) mutate();
  }

  async function remove(t: Todo) {
    if (busy.has(t.id)) return;
    setBusyId(t.id, true);
    const res = await fetch(`${listKey}/${t.id}`, { method: "DELETE" });
    setBusyId(t.id, false);
    // A 404 (someone else already deleted it) is fine — just refresh.
    mutate();
    if (!res.ok && res.status !== 404) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to delete");
    }
  }

  return (
    <div className="px-4 pt-4">
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        {/* Heading */}
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-lg text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            To-dos
            {open.length > 0 && <span className="text-sage text-base"> · {open.length} open</span>}
          </h2>
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2 mb-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add a reminder so nothing slips…"
            maxLength={500}
            className="flex-1 text-sm text-charcoal bg-cream border border-stone rounded-xl px-3 py-2.5 focus:outline-none focus:border-forest"
          />
          <button
            onClick={add}
            disabled={adding || !text.trim()}
            className="flex items-center gap-1.5 bg-forest text-offwhite text-sm px-4 py-2.5 rounded-xl hover:bg-garden disabled:opacity-40 disabled:hover:bg-forest transition-colors shrink-0"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </div>
        {error && <p className="text-xs text-terra mb-2">{error}</p>}

        {/* Open items */}
        {open.length === 0 && done.length === 0 ? (
          <p className="text-sm text-sage py-2">No to-dos yet. Add a reminder so nothing slips.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto -mx-1 px-1">
            {open.length === 0 ? (
              <p className="text-sm text-sage py-1">Nothing open. 🎉</p>
            ) : (
              open.map((t) => (
                <TodoRow key={t.id} t={t} busy={busy.has(t.id)} onToggle={toggle} onRemove={remove} />
              ))
            )}
          </div>
        )}

        {/* Done section (collapsed) */}
        {done.length > 0 && (
          <div className="mt-2 border-t border-stone/50 pt-2">
            <button
              onClick={() => setDoneOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm text-sage hover:text-charcoal py-1"
            >
              {doneOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Done ({done.length})
            </button>
            {doneOpen && (
              <div className="max-h-64 overflow-y-auto -mx-1 px-1">
                {done.map((t) => (
                  <TodoRow key={t.id} t={t} busy={busy.has(t.id)} onToggle={toggle} onRemove={remove} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  t,
  busy,
  onToggle,
  onRemove,
}: {
  t: Todo;
  busy: boolean;
  onToggle: (t: Todo) => void;
  onRemove: (t: Todo) => void;
}) {
  const isDone = t.status === "done";
  const meta = isDone
    ? `Done by ${t.completed_by_name ?? "Unknown"} · ${relativeTime(t.completed_at)}`
    : `Added by ${t.created_by_name} · ${relativeTime(t.created_at)}`;

  return (
    <div className="group flex items-start gap-1">
      <button
        onClick={() => onToggle(t)}
        disabled={busy}
        aria-label={isDone ? "Reopen to-do" : "Mark to-do done"}
        className="h-11 w-11 flex items-center justify-center shrink-0 text-sage hover:text-forest disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isDone ? (
          <CheckSquare size={20} className="text-forest" />
        ) : (
          <Square size={20} />
        )}
      </button>
      <div className="flex-1 min-w-0 py-1.5">
        <p className={`text-sm break-words ${isDone ? "line-through text-sage" : "text-charcoal"}`}>
          {t.text}
        </p>
        <p className="text-xs text-sage mt-0.5">{meta}</p>
      </div>
      <button
        onClick={() => onRemove(t)}
        disabled={busy}
        aria-label="Delete to-do"
        className="h-11 w-11 flex items-center justify-center shrink-0 text-sage hover:text-terra opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
      >
        <X size={16} />
      </button>
    </div>
  );
}
