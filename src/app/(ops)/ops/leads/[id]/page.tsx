"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft, MessageCircle, UserPlus, RotateCcw, XCircle, Trash2,
  Pencil, Send, StickyNote, Plus, CheckCircle2, RefreshCw, Edit3, X, CalendarClock,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import CloseLeadModal from "@/components/ops/leads/CloseLeadModal";
import {
  SOURCE_OPTIONS, SOURCE_LABELS, STATE_LABELS, CLOSED_REASON_LABELS,
  PLANT_RANGE_LABELS, INTENDED_TYPE_OPTIONS, CUSTOMER_TYPE_LABELS,
  formatTimestamp, relativeTime, historyVerb, waDigits,
  type LeadListItem, type LeadHistoryEvent,
} from "@/components/ops/leads/leadConstants";
import type { LeadClosedReason } from "@/lib/schemas/lead.schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";
const labelCls = "block text-xs font-medium text-charcoal mb-1";
const ADD_NEW = "__add_new__";
const WATERING_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "house_help", label: "House help" },
  { value: "others", label: "Others" },
];
const PLANT_RANGES = ["0_20", "20_40", "40_plus"] as const;

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const { data: leadRes, isLoading, mutate: mutateLead } = useSWR(`/api/ops/leads/${leadId}`, fetcher);
  const { data: histRes, mutate: mutateHist } = useSWR(`/api/ops/leads/${leadId}/history`, fetcher);
  const lead: LeadListItem | null = leadRes?.data ?? null;
  const history: LeadHistoryEvent[] = histRes?.data ?? [];

  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() { mutateLead(); mutateHist(); }

  async function handleClose(reason: LeadClosedReason, note: string) {
    const res = await fetch(`/api/ops/leads/${leadId}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed_reason: reason, closed_note: note || undefined }),
    });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Failed to close"); }
    setShowClose(false); refresh();
  }

  async function handleReactivate() {
    setActionLoading(true); setError(null);
    const res = await fetch(`/api/ops/leads/${leadId}/reactivate`, { method: "POST" });
    setActionLoading(false);
    if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to reactivate"); return; }
    refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this lead permanently? This removes its notes and history.")) return;
    setActionLoading(true); setError(null);
    const res = await fetch(`/api/ops/leads/${leadId}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to delete"); setActionLoading(false); return; }
    router.push("/ops/leads");
  }

  function handleConvert() {
    if (!lead) return;
    const q = lead.qualifiers ?? {};
    const p = new URLSearchParams();
    p.set("from_lead", lead.id);
    // Land the wizard on the right step list. Null intended type → care_plan
    // (the historical default); the operator can still change it on step 0.
    p.set("customer_type", lead.intended_customer_type ?? "care_plan");
    if (lead.name) p.set("name", lead.name);
    p.set("phone", lead.phone);
    if (lead.society_id) p.set("society_id", lead.society_id);
    if (q.plant_count_range) p.set("plant_count_range", q.plant_count_range);
    if (q.light) p.set("light_condition", q.light);
    if (q.watering_responsibility?.length) p.set("watering_responsibility", q.watering_responsibility.join(","));
    router.push(`/ops/customers/new?${p.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 animate-pulse">
          <div className="h-6 w-40 bg-stone/30 rounded mb-2" />
          <div className="h-3 w-56 bg-stone/20 rounded" />
        </div>
        <div className="px-4 pt-4 space-y-4 max-w-[720px] mx-auto">
          <div className="h-28 bg-offwhite rounded-2xl border border-stone/60" />
          <div className="h-48 bg-offwhite rounded-2xl border border-stone/60" />
        </div>
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-terra">Lead not found</p>
      </div>
    );
  }

  const isActive = lead.state === "active";

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2 max-w-[720px] mx-auto">
          <button onClick={() => router.push("/ops/leads")} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-charcoal truncate" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
                {lead.name || lead.phone}
              </h1>
              <StateBadge state={lead.state} />
            </div>
          </div>
          <button
            onClick={() => setShowEdit((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs transition-colors flex-shrink-0 ${
              showEdit ? "border-forest bg-forest text-offwhite" : "border-stone text-charcoal hover:border-forest hover:text-forest"
            }`}
          >
            <Pencil size={13} /> {showEdit ? "Editing" : "Edit details"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sage max-w-[720px] mx-auto pl-8">
          <a href={`https://wa.me/${waDigits(lead.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest hover:text-garden">
            <MessageCircle size={12} /> {lead.phone}
          </a>
          {lead.source && <span className="px-2 py-0.5 rounded-full bg-cream border border-stone/60 text-charcoal">{SOURCE_LABELS[lead.source]}</span>}
          {lead.intended_customer_type && (
            <span className="px-2 py-0.5 rounded-full bg-forest/10 text-forest">
              → {CUSTOMER_TYPE_LABELS[lead.intended_customer_type]}
            </span>
          )}
          {(lead.society_name || lead.area) && <span>{lead.society_name ?? lead.area}</span>}
          <span>Lead since {formatDate((lead.created_at || "").split("T")[0])}</span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[720px] mx-auto">
        {error && <p className="text-sm text-terra">{error}</p>}

        {/* Edit details (opt-in) */}
        {showEdit && (
          <EditDetails lead={lead} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); refresh(); }} />
        )}

        {/* Closed info — closed only */}
        {!isActive && lead.state === "closed" && (
          <Card title="Closed">
            <div className="space-y-1 text-sm">
              <Row label="Reason" value={lead.closed_reason ? CLOSED_REASON_LABELS[lead.closed_reason] : "—"} />
              {lead.closed_note && <div className="pt-1"><p className="text-xs text-sage">Note</p><p className="text-charcoal mt-0.5">{lead.closed_note}</p></div>}
              {lead.closed_at && <Row label="Closed" value={formatTimestamp(lead.closed_at)} />}
            </div>
          </Card>
        )}

        {/* History + notes + follow-up (unified update) */}
        <HistoryCard lead={lead} history={history} onSaved={refresh} />

        {/* Actions */}
        <div className="space-y-2">
          {isActive ? (
            <div className="flex gap-3">
              <button onClick={() => setShowClose(true)} className="flex-1 py-2.5 border border-stone text-charcoal rounded-xl text-sm font-medium hover:bg-cream flex items-center justify-center gap-1.5">
                <XCircle size={15} /> Close lead
              </button>
              <button onClick={handleConvert} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden flex items-center justify-center gap-1.5">
                <UserPlus size={15} /> Convert to customer
              </button>
            </div>
          ) : (
            <button onClick={handleReactivate} disabled={actionLoading} className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-1.5">
              <RotateCcw size={15} /> {actionLoading ? "Reactivating…" : "Reactivate"}
            </button>
          )}
          <button onClick={handleDelete} disabled={actionLoading} className="w-full py-2 text-terra hover:bg-terra/5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40">
            <Trash2 size={13} /> Delete lead
          </button>
        </div>
      </div>

      {showClose && (
        <CloseLeadModal leadName={lead.name || lead.phone} onClose={() => setShowClose(false)} onConfirm={handleClose} />
      )}
    </div>
  );
}

// ── Unified update (note + follow-up) + history timeline ──────────────────────
function HistoryCard({ lead, history, onSaved }: { lead: LeadListItem; history: LeadHistoryEvent[]; onSaved: () => void }) {
  const isActive = lead.state === "active";
  const [body, setBody] = useState("");
  const [action, setAction] = useState(lead.next_action ?? "");
  const [date, setDate] = useState(lead.next_action_at ?? "");
  const [saving, setSaving] = useState(false);

  const followUpDirty = isActive && (action !== (lead.next_action ?? "") || date !== (lead.next_action_at ?? ""));
  const canSave = body.trim().length > 0 || followUpDirty;

  async function saveUpdate() {
    if (!canSave) return;
    setSaving(true);
    try {
      // One click → follow-up change (if any) + note (if any), together.
      if (followUpDirty) {
        await fetch(`/api/ops/leads/${lead.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next_action: action || null, next_action_at: date || null }),
        });
      }
      if (body.trim()) {
        await fetch(`/api/ops/leads/${lead.id}/notes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        });
      }
      setBody("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="History & notes">
      {/* Unified composer */}
      <div className="mb-4 space-y-3">
        <textarea
          className={`${inputCls} min-h-[72px]`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note — what was said, promised, pending…"
        />
        {isActive && (
          <div className="bg-cream/50 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-medium text-sage uppercase tracking-wider">Next follow-up <span className="normal-case text-[10px]">(optional)</span></p>
            <input className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Follow up re: balcony photo" />
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <a
            href={`https://wa.me/${waDigits(lead.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-4 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
          >
            <MessageCircle size={15} /> Send WhatsApp
          </a>
          <button onClick={saveUpdate} disabled={saving || !canSave} className="py-2 px-5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center gap-1.5">
            <Send size={14} /> {saving ? "Saving…" : "Save update"}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {history.length === 0 ? (
        <p className="text-sm text-stone">No history yet.</p>
      ) : (
        <ol className="space-y-3">
          {history.map((ev) => (
            <li key={`${ev.kind}-${ev.id}`} className="flex gap-3">
              <EventIcon kind={ev.kind} />
              <div className="min-w-0 flex-1 pb-3 border-b border-stone/20 last:border-0">
                <p className="text-xs text-sage">
                  <span className="text-charcoal font-medium">{ev.actor_name || "Someone"}</span>{" "}
                  {historyVerb(ev.kind)}
                  {ev.kind === "closed" && ev.detail && (
                    <span className="text-charcoal"> · {CLOSED_REASON_LABELS[ev.detail as LeadClosedReason] ?? ev.detail}</span>
                  )}
                  {ev.kind === "follow_up" && ev.detail && (
                    <span className="text-charcoal"> for {formatDate(ev.detail)}</span>
                  )}
                  {" · "}
                  <span title={formatTimestamp(ev.at)}>{relativeTime(ev.at)}</span>
                </p>
                {ev.kind === "note" && ev.body && (
                  <p className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap mt-1">{ev.body}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function EventIcon({ kind }: { kind: LeadHistoryEvent["kind"] }) {
  const map = {
    note: <StickyNote size={14} className="text-forest" />,
    created: <Plus size={14} className="text-sage" />,
    closed: <XCircle size={14} className="text-terra" />,
    reactivated: <RefreshCw size={14} className="text-forest" />,
    converted: <CheckCircle2 size={14} className="text-forest" />,
    follow_up: <CalendarClock size={14} className="text-garden" />,
    updated: <Edit3 size={14} className="text-sage" />,
  } as const;
  return (
    <span className="w-7 h-7 rounded-full bg-cream border border-stone/60 flex items-center justify-center flex-shrink-0 mt-0.5">
      {map[kind]}
    </span>
  );
}

// ── Edit details (opt-in) ─────────────────────────────────────────────────────
function EditDetails({ lead, onClose, onSaved }: { lead: LeadListItem; onClose: () => void; onSaved: () => void }) {
  const { data: societiesData } = useSWR("/api/ops/societies", fetcher);
  const societies: { id: string; name: string }[] = societiesData?.data ?? [];
  const q = useMemo(() => lead.qualifiers ?? {}, [lead]);

  const [name, setName] = useState(lead.name ?? "");
  const [source, setSource] = useState(lead.source ?? "");
  const [intendedType, setIntendedType] = useState<string>(lead.intended_customer_type ?? "");
  const [societyId, setSocietyId] = useState(lead.society_id ?? "");
  const [newSociety, setNewSociety] = useState("");
  const [area, setArea] = useState(lead.area ?? "");
  const [direction, setDirection] = useState(q.direction ?? "");
  const [light, setLight] = useState(q.light ?? "");
  const [plantRange, setPlantRange] = useState(q.plant_count_range ?? "");
  const [watering, setWatering] = useState<string[]>(q.watering_responsibility ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      let finalSociety = societyId;
      if (societyId === ADD_NEW) {
        if (newSociety.trim()) {
          const r = await fetch("/api/ops/societies", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newSociety.trim() }),
          });
          const j = await r.json();
          finalSociety = j.data?.id ?? "";
        } else finalSociety = "";
      }
      const qualifiers: Record<string, unknown> = { ...q,
        direction: direction || undefined, light: light || undefined,
        plant_count_range: plantRange || undefined,
        watering_responsibility: watering.length ? watering : undefined };
      const res = await fetch(`/api/ops/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, source: source || null, intended_customer_type: intendedType || null, society_id: finalSociety || null, area: area || null, qualifiers }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Failed to save"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-offwhite rounded-2xl border border-forest/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-sage uppercase tracking-widest">Edit lead details</p>
        <button onClick={onClose} className="text-stone hover:text-charcoal"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={labelCls}>Name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className={labelCls}>Source</label>
          <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">—</option>
            {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Converting to</label>
          <select className={inputCls} value={intendedType} onChange={(e) => setIntendedType(e.target.value)}>
            {INTENDED_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Society</label>
          <select className={inputCls} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
            <option value="">—</option>
            {societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value={ADD_NEW}>+ Add new society…</option>
          </select>
          {societyId === ADD_NEW && (
            <input className={`${inputCls} mt-2`} value={newSociety} onChange={(e) => setNewSociety(e.target.value)} placeholder="New society name" />
          )}
        </div>
        <div><label className={labelCls}>Area</label><input className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Whitefield" /></div>
        <div><label className={labelCls}>Balcony direction</label><input className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="North-facing" /></div>
        <div><label className={labelCls}>Light</label><input className={inputCls} value={light} onChange={(e) => setLight(e.target.value)} placeholder="Partial shade" /></div>
      </div>
      <div>
        <label className={labelCls}>Plant count</label>
        <div className="flex gap-2">
          {PLANT_RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setPlantRange(plantRange === r ? "" : r)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${plantRange === r ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"}`}>
              {PLANT_RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Watering responsibility</label>
        <div className="flex gap-2 flex-wrap">
          {WATERING_OPTIONS.map((w) => {
            const sel = watering.includes(w.value);
            return (
              <button key={w.value} type="button"
                onClick={() => setWatering(sel ? watering.filter((v) => v !== w.value) : [...watering, w.value])}
                className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${sel ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"}`}>
                {w.label}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-terra">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40">{saving ? "Saving…" : "Save details"}</button>
      </div>
    </div>
  );
}

// ── Small bits ────────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: "active" | "converted" | "closed" }) {
  if (state === "closed") return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-terra/10 text-terra flex-shrink-0">Closed</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-forest/10 text-forest flex-shrink-0">{STATE_LABELS.active}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
      <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-sage">{label}</span>
      <span className="text-charcoal font-medium text-right">{value}</span>
    </div>
  );
}
