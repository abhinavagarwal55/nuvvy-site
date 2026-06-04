"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CLOSED_REASON_OPTIONS } from "./leadConstants";
import type { LeadClosedReason } from "@/lib/schemas/lead.schema";

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

export default function CloseLeadModal({
  leadName,
  onClose,
  onConfirm,
}: {
  leadName: string;
  onClose: () => void;
  onConfirm: (reason: LeadClosedReason, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<LeadClosedReason | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOtherHint = reason === "other" && note.trim() === "";

  async function handleConfirm() {
    if (!reason) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason, note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close lead");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60] px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 mb-16 md:mb-0">
        <div className="flex items-center justify-between mb-1">
          <h2
            className="text-xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Close lead
          </h2>
          <button onClick={onClose} className="text-stone hover:text-charcoal">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-sage mb-4">{leadName}</p>

        {/* Reason — required radio */}
        <p className="text-xs font-medium text-charcoal mb-2">Reason</p>
        <div className="space-y-2 mb-4">
          {CLOSED_REASON_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setReason(opt.value)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                reason === opt.value
                  ? "border-forest bg-forest/10 text-charcoal"
                  : "border-stone/60 text-charcoal hover:border-forest/40"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  reason === opt.value ? "border-forest bg-forest" : "border-stone"
                }`}
              />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Note — optional */}
        <label className="block text-xs font-medium text-charcoal mb-1">
          Note <span className="text-sage text-[10px]">(optional)</span>
        </label>
        <textarea
          className={`${inputCls} min-h-[72px]`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened? (optional)"
        />
        {showOtherHint && (
          <p className="text-xs text-terra mt-1">Other — please add a short note</p>
        )}

        {error && <p className="text-sm text-terra mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!reason || saving}
            className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Closing…" : "Close lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
