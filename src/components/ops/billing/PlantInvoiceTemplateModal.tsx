"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  PLANT_INVOICE_TEMPLATE_TOKEN_HELP,
  renderPlantInvoiceTemplate,
} from "@/lib/billing/plant-invoice-template";
import { DEFAULT_NUVVY_UPI_ID } from "@/lib/billing/template";

export default function PlantInvoiceTemplateModal({
  initialTemplate,
  initialServiceLines,
  initialFooterNote,
  onClose,
  onSaved,
}: {
  initialTemplate: string;
  initialServiceLines: string[];
  initialFooterNote: string;
  onClose: () => void;
  onSaved: (template: string, serviceLines: string[], footerNote: string) => void;
}) {
  const [text, setText] = useState(initialTemplate);
  const [lines, setLines] = useState<string[]>(
    initialServiceLines.length > 0 ? initialServiceLines : [""]
  );
  const [footerNote, setFooterNote] = useState(initialFooterNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      renderPlantInvoiceTemplate(text, {
        customer_name: "Rahul Patidar",
        invoice_number: "NUV-2026-0001",
        invoice_date: "15 June 2026",
        total: 24500,
        upi_id: DEFAULT_NUVVY_UPI_ID,
      }),
    [text]
  );

  function updateLine(i: number, v: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? v : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, ""]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const cleaned = lines.map((l) => l.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/ops/system-config/plant-invoice-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: text, service_lines: cleaned, footer_note: footerNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to save");
        setSaving(false);
        return;
      }
      onSaved(
        json.data?.template ?? text,
        json.data?.service_lines ?? cleaned,
        json.data?.footer_note ?? footerNote
      );
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 pb-20 md:pb-0 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[560px] p-6 max-h-[85vh] overflow-y-auto mb-16 md:mb-0">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Plant invoice template
        </h2>

        {/* WhatsApp message */}
        <p className="text-[10px] text-sage uppercase tracking-wider mb-1">
          WhatsApp message
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest font-mono"
        />

        <div className="mt-3">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">Tokens</p>
          <ul className="text-xs text-charcoal space-y-0.5">
            {PLANT_INVOICE_TEMPLATE_TOKEN_HELP.map((t) => (
              <li key={t.token}>
                <code className="bg-cream px-1 rounded">{`{${t.token}}`}</code> — {t.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">Preview</p>
          <pre className="whitespace-pre-wrap text-xs text-charcoal bg-cream/60 border border-stone/40 rounded-xl p-3 font-sans">
            {preview}
          </pre>
        </div>

        {/* Default service lines */}
        <div className="mt-5">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-2">
            Default Service &amp; Materials lines
          </p>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={line}
                  onChange={(e) => updateLine(i, e.target.value)}
                  placeholder="Service line description"
                  className="flex-1 px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone"
                />
                <button
                  onClick={() => removeLine(i)}
                  className="text-terra hover:text-terra/80 p-2"
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addLine}
            className="flex items-center gap-1 text-sm text-forest hover:text-garden font-medium mt-2"
          >
            <Plus size={14} /> Add line
          </button>
        </div>

        {/* PDF footer note */}
        <div className="mt-5">
          <p className="text-[10px] text-sage uppercase tracking-wider mb-1">
            PDF footer note
          </p>
          <textarea
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            rows={5}
            placeholder="Explanatory note printed at the bottom of the invoice PDF…"
            className="w-full px-3 py-2 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
          />
        </div>

        {error && <p className="text-sm text-terra mt-3">{error}</p>}

        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
