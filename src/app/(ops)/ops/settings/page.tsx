"use client";

import { useState, useEffect } from "react";
import { Pencil, Check, X, Loader2, AlertTriangle } from "lucide-react";

type CareActionType = {
  id: string;
  name: string;
  default_frequency_days: number;
};

type AffectedCustomer = {
  schedule_id: string;
  customer_id: string;
  customer_name: string;
  current_next_due: string | null;
  new_next_due: string;
  changed: boolean;
};

type Preview = {
  action_name: string;
  current_frequency_days: number;
  new_frequency_days: number;
  total_customers: number;
  changed_count: number;
  affected: AffectedCustomer[];
};

const CARE_ACTION_LABELS: Record<string, string> = {
  fertilizer: "Fertilizer",
  neem_oil: "Neem Oil",
  micro_nutrients: "Micro Nutrients",
  vermi_compost: "Vermi Compost",
  pesticide: "Pesticide",
  fungicide: "Fungicide",
  soil_amendment: "Soil Amendment",
};

const inputCls =
  "w-20 px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest text-center";

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SettingsPage() {
  const [types, setTypes] = useState<CareActionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Preview / confirm modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingType, setPendingType] = useState<CareActionType | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops/care-action-types");
    const json = await res.json();
    setTypes(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(t: CareActionType) {
    setEditingId(t.id);
    setEditValue(t.default_frequency_days);
    setStatusMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setStatusMsg(null);
  }

  async function openPreview(t: CareActionType) {
    if (editValue < 1 || editValue > 365) {
      alert("Frequency must be between 1 and 365 days");
      return;
    }
    if (editValue === t.default_frequency_days) {
      cancelEdit();
      return;
    }

    setPendingType(t);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setAcknowledged(false);
    setPreview(null);

    const res = await fetch(
      `/api/ops/care-action-types/${t.id}/preview?frequency=${editValue}`
    );
    const json = await res.json();
    setPreviewLoading(false);
    if (!res.ok) {
      alert(json.error ?? "Failed to load preview");
      setPreviewOpen(false);
      return;
    }
    setPreview(json.data);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreview(null);
    setPendingType(null);
    setAcknowledged(false);
  }

  async function confirmSave() {
    if (!pendingType || !preview) return;
    setSubmitting(true);
    const res = await fetch(`/api/ops/care-action-types/${pendingType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_frequency_days: preview.new_frequency_days }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      alert(json.error ?? "Failed to save");
      return;
    }
    const label = CARE_ACTION_LABELS[pendingType.name] ?? pendingType.name;
    setStatusMsg(
      `${label} frequency changed to ${preview.new_frequency_days} days. ${json.schedules_recomputed} customer schedule${json.schedules_recomputed === 1 ? "" : "s"} recomputed.`
    );
    closePreview();
    setEditingId(null);
    load();
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pl-56">
      <div className="bg-offwhite border-b border-stone px-4 md:px-8 pt-6 pb-4 sticky top-0 z-10">
        <h1
          className="text-2xl text-charcoal"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Settings
        </h1>
      </div>

      <div className="px-4 md:px-8 pt-6 max-w-[720px] space-y-6">
        <section>
          <h2
            className="text-lg text-charcoal mb-1"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Care Actions
          </h2>
          <p className="text-xs text-sage mb-3">
            System-wide default frequency for each care action. Editing recomputes the next-due date for every customer using the same anchored cycle.
          </p>

          {statusMsg && (
            <div className="mb-3 px-3 py-2 bg-forest/10 text-forest text-sm rounded-xl">
              {statusMsg}
            </div>
          )}

          <div className="bg-offwhite rounded-2xl border border-stone/60 divide-y divide-stone/50">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sage">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading…
              </div>
            ) : types.length === 0 ? (
              <p className="text-sm text-stone text-center py-8">No care actions found.</p>
            ) : (
              types.map((t) => {
                const isEditing = editingId === t.id;
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div className="text-sm text-charcoal">
                      {CARE_ACTION_LABELS[t.name] ?? t.name}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            className={inputCls}
                            value={editValue}
                            onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                            autoFocus
                          />
                          <span className="text-xs text-sage">days</span>
                          <button
                            onClick={() => openPreview(t)}
                            className="text-forest hover:text-garden p-1"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-stone hover:text-terra p-1"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-charcoal font-medium">
                            every {t.default_frequency_days} days
                          </span>
                          <button
                            onClick={() => startEdit(t)}
                            className="text-sage hover:text-forest p-1"
                          >
                            <Pencil size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Preview / Confirm modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-3 border-b border-stone/50">
              <div className="flex items-start gap-3">
                <div className="bg-terra/10 p-2 rounded-xl">
                  <AlertTriangle size={18} className="text-terra" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-charcoal">
                    Confirm frequency change
                  </h2>
                  {pendingType && preview && (
                    <p className="text-sm text-sage mt-0.5">
                      {CARE_ACTION_LABELS[pendingType.name] ?? pendingType.name}: every{" "}
                      <span className="text-charcoal font-medium">
                        {preview.current_frequency_days} days
                      </span>{" "}
                      →{" "}
                      <span className="text-charcoal font-medium">
                        {preview.new_frequency_days} days
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              {previewLoading ? (
                <div className="flex items-center justify-center py-10 text-sage">
                  <Loader2 size={16} className="animate-spin mr-2" /> Computing impact…
                </div>
              ) : preview ? (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-cream rounded-xl px-3 py-2">
                      <p className="text-[10px] text-sage uppercase tracking-wide">Total customers</p>
                      <p className="text-lg text-charcoal font-medium">{preview.total_customers}</p>
                    </div>
                    <div className="bg-cream rounded-xl px-3 py-2">
                      <p className="text-[10px] text-sage uppercase tracking-wide">Schedules changing</p>
                      <p className="text-lg text-charcoal font-medium">{preview.changed_count}</p>
                    </div>
                  </div>

                  {/* Customer list */}
                  {preview.affected.length === 0 ? (
                    <p className="text-sm text-stone text-center py-6">
                      No customers have a schedule for this care action yet.
                    </p>
                  ) : (
                    <div className="border border-stone/60 rounded-xl overflow-hidden">
                      <div className="bg-cream px-3 py-2 grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-sage font-medium">
                        <div className="col-span-5">Customer</div>
                        <div className="col-span-3">Current next-due</div>
                        <div className="col-span-3">New next-due</div>
                        <div className="col-span-1"></div>
                      </div>
                      <div className="divide-y divide-stone/40 max-h-64 overflow-y-auto">
                        {preview.affected.map((a) => (
                          <div
                            key={a.schedule_id}
                            className="px-3 py-2 grid grid-cols-12 gap-2 text-xs items-center"
                          >
                            <div className="col-span-5 text-charcoal truncate">{a.customer_name}</div>
                            <div className="col-span-3 text-sage">{formatDate(a.current_next_due)}</div>
                            <div className={`col-span-3 ${a.changed ? "text-charcoal font-medium" : "text-sage"}`}>
                              {formatDate(a.new_next_due)}
                            </div>
                            <div className="col-span-1 text-right">
                              {a.changed ? (
                                <span className="text-[10px] text-terra">●</span>
                              ) : (
                                <span className="text-[10px] text-stone">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-sage mt-3">
                    Customers may notice their next service date shift by a few days. The cycle anchor stays the same — only the cadence changes.
                  </p>
                </>
              ) : null}
            </div>

            {/* Confirm footer with double confirmation */}
            <div className="px-6 py-4 border-t border-stone/50 bg-cream/40 rounded-b-2xl">
              <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={previewLoading || submitting}
                  className="mt-0.5"
                />
                <span className="text-xs text-charcoal">
                  I understand this will change the schedule for{" "}
                  <span className="font-medium">{preview?.changed_count ?? 0}</span> customer
                  {preview?.changed_count === 1 ? "" : "s"} and affect their next service due date.
                </span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={closePreview}
                  disabled={submitting}
                  className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSave}
                  disabled={!acknowledged || previewLoading || submitting || !preview}
                  className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Saving…
                    </span>
                  ) : (
                    "Confirm change"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
