"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { X, ExternalLink } from "lucide-react";
import { SOURCE_OPTIONS, INTENDED_TYPE_OPTIONS } from "./leadConstants";

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";
const labelCls = "block text-xs font-medium text-charcoal mb-1";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const last10 = (s: string) => s.replace(/[^\d]/g, "").slice(-10);
const ADD_NEW = "__add_new__";

export default function LeadCreateModal({
  onClose,
  onCreated,
  onOpenLead,
  initialPhone = "",
  initialName = "",
}: {
  onClose: () => void;
  onCreated: () => void;
  onOpenLead: (id: string) => void;
  initialPhone?: string;
  initialName?: string;
}) {
  const { data: societiesData } = useSWR("/api/ops/societies", fetcher);
  const societies: { id: string; name: string }[] = societiesData?.data ?? [];

  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [source, setSource] = useState("");
  const [intendedType, setIntendedType] = useState("");
  const [societyId, setSocietyId] = useState("");
  const [newSociety, setNewSociety] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerMatch, setCustomerMatch] = useState<string | null>(null);
  const [activeLeadMatch, setActiveLeadMatch] = useState<string | null>(null);
  const [closedLeadMatch, setClosedLeadMatch] = useState<string | null>(null);

  function resetMatches() {
    setError(null);
    setCustomerMatch(null);
    setActiveLeadMatch(null);
    setClosedLeadMatch(null);
  }

  function payload(resolvedSocietyId: string) {
    return {
      phone,
      name: name || undefined,
      source: source || undefined,
      intended_customer_type: intendedType || undefined,
      society_id: resolvedSocietyId || undefined,
      area: area || undefined,
      notes: notes || undefined,
      next_action: nextAction || undefined,
      next_action_at: nextActionAt || undefined,
    };
  }

  // Resolve the society selection to an id, creating a new society if needed.
  async function resolveSociety(): Promise<string> {
    if (societyId !== ADD_NEW) return societyId;
    if (!newSociety.trim()) return "";
    const r = await fetch("/api/ops/societies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSociety.trim() }),
    });
    const j = await r.json();
    return j.data?.id ?? "";
  }

  // Reactivate-by-default: if a closed lead exists for this phone, prefer
  // reopening that row over creating a fresh one.
  async function findClosedLead(): Promise<string | null> {
    try {
      const res = await fetch(`/api/ops/leads?state=closed&q=${encodeURIComponent(phone)}`);
      const json = await res.json();
      const wanted = last10(phone);
      const match = (json.leads ?? []).find(
        (l: { id: string; phone: string }) => last10(l.phone) === wanted
      );
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  async function doCreate() {
    setSaving(true);
    resetMatches();
    try {
      const resolvedSociety = await resolveSociety();
      const res = await fetch("/api/ops/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(resolvedSociety)),
      });
      const json = await res.json();
      if (res.status === 400 && json.customer_id) {
        setCustomerMatch(json.customer_id);
        return;
      }
      if (res.status === 409 && json.existing_lead_id) {
        setActiveLeadMatch(json.existing_lead_id);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Failed to create lead");
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!phone.trim()) {
      setError("Phone is required");
      return;
    }
    setSaving(true);
    resetMatches();
    const closedId = await findClosedLead();
    setSaving(false);
    if (closedId) {
      setClosedLeadMatch(closedId);
      return;
    }
    await doCreate();
  }

  async function handleReactivate() {
    if (!closedLeadMatch) return;
    setSaving(true);
    const res = await fetch(`/api/ops/leads/${closedLeadMatch}/reactivate`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to reactivate");
      return;
    }
    onCreated();
    onOpenLead(closedLeadMatch);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center md:items-center">
      <div className="bg-offwhite w-full max-w-[480px] rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh] mb-16 md:mb-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone/60 flex items-center justify-between">
          <h2
            className="text-xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            New lead
          </h2>
          <button onClick={onClose} className="text-stone hover:text-charcoal">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className={labelCls}>Phone <span className="text-terra">*</span></label>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); resetMatches(); }}
              placeholder="e.g. 98765 43210"
              type="tel"
              autoFocus
            />
          </div>

          {/* Duplicate / match branches */}
          {customerMatch && (
            <div className="bg-terra/5 border border-terra/20 rounded-xl p-3 text-sm">
              <p className="text-charcoal mb-1">This phone belongs to an existing customer.</p>
              <Link
                href={`/ops/customers/${customerMatch}`}
                className="inline-flex items-center gap-1 text-forest hover:text-garden font-medium"
              >
                Open customer <ExternalLink size={13} />
              </Link>
            </div>
          )}
          {activeLeadMatch && (
            <div className="bg-forest/5 border border-forest/20 rounded-xl p-3 text-sm">
              <p className="text-charcoal mb-2">There&apos;s already an active lead for this phone.</p>
              <button
                onClick={() => onOpenLead(activeLeadMatch)}
                className="text-forest hover:text-garden font-medium"
              >
                Open existing lead →
              </button>
            </div>
          )}
          {closedLeadMatch && (
            <div className="bg-forest/5 border border-forest/20 rounded-xl p-3 text-sm">
              <p className="text-charcoal mb-2">There&apos;s a closed lead for this phone — reactivate it?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleReactivate}
                  disabled={saving}
                  className="px-3 py-1.5 bg-forest text-offwhite rounded-lg text-xs font-medium hover:bg-garden disabled:opacity-40"
                >
                  {saving ? "Reactivating…" : "Reactivate"}
                </button>
                <button
                  onClick={() => { setClosedLeadMatch(null); doCreate(); }}
                  disabled={saving}
                  className="px-3 py-1.5 border border-stone text-charcoal rounded-lg text-xs font-medium hover:bg-cream disabled:opacity-40"
                >
                  Create new anyway
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Name <span className="text-sage text-[10px]">(optional)</span></label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Source <span className="text-sage text-[10px]">(optional)</span></label>
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Converting to <span className="text-sage text-[10px]">(optional)</span></label>
              <select className={inputCls} value={intendedType} onChange={(e) => setIntendedType(e.target.value)}>
                {INTENDED_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Society <span className="text-sage text-[10px]">(optional)</span></label>
              <select className={inputCls} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
                <option value="">—</option>
                {societies.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value={ADD_NEW}>+ Add new society…</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Area <span className="text-sage text-[10px]">(optional)</span></label>
              <input className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Whitefield" />
            </div>
          </div>
          {societyId === ADD_NEW && (
            <div>
              <label className={labelCls}>New society name</label>
              <input className={inputCls} value={newSociety} onChange={(e) => setNewSociety(e.target.value)} placeholder="e.g. Prestige White Meadows" autoFocus />
            </div>
          )}
          <div>
            <label className={labelCls}>Notes <span className="text-sage text-[10px]">(optional)</span></label>
            <textarea className={`${inputCls} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, what they asked for…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Next action <span className="text-sage text-[10px]">(optional)</span></label>
              <input className={inputCls} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Follow up re:…" />
            </div>
            <div>
              <label className={labelCls}>Follow-up date <span className="text-sage text-[10px]">(optional)</span></label>
              <input type="date" className={inputCls} value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-terra">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-stone/60 px-5 py-3 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !phone.trim()}
            className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
          >
            {saving ? "Saving…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
