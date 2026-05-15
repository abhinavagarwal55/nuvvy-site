"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function NewRailPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    segment: "plants" as "plants" | "accessories",
    cta_label: "",
    cta_link: "",
    notes_internal: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    const hasLabel = Boolean(form.cta_label.trim());
    const hasLink = Boolean(form.cta_link.trim());
    if (hasLabel !== hasLink) {
      setError("Provide both CTA label and CTA link, or neither.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/internal/catalog/rails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        segment: form.segment,
        cta_label: form.cta_label.trim() || null,
        cta_link: form.cta_link.trim() || null,
        notes_internal: form.notes_internal.trim() || null,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error || "Failed to create rail");
      return;
    }
    router.push(`/internal/catalog/rails/${json.data.id}`);
  }

  return (
    <div className="hidden md:block max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">New Rail</h1>
        <Link href="/internal/catalog/rails" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back
        </Link>
      </div>
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            className={inputCls}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Best for north-facing balconies"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Subtitle (optional)</label>
          <input
            type="text"
            className={inputCls}
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="e.g. Low-light tolerant"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Segment * (immutable after creation)</label>
          <div className="flex gap-3">
            {(["plants", "accessories"] as const).map((seg) => (
              <label key={seg} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="segment"
                  value={seg}
                  checked={form.segment === seg}
                  onChange={() => setForm((f) => ({ ...f, segment: seg }))}
                />
                <span className="capitalize">{seg}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">CTA label (optional)</label>
            <input
              type="text"
              className={inputCls}
              value={form.cta_label}
              onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
              placeholder="See all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">CTA link (optional)</label>
            <input
              type="text"
              className={inputCls}
              value={form.cta_link}
              onChange={(e) => setForm((f) => ({ ...f, cta_link: e.target.value }))}
              placeholder="/plantcatalog?light=partial"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Internal notes</label>
          <textarea
            rows={2}
            className={inputCls}
            value={form.notes_internal}
            onChange={(e) => setForm((f) => ({ ...f, notes_internal: e.target.value }))}
          />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex gap-2 pt-2">
          <Link
            href="/internal/catalog/rails"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
          >
            {submitting ? "Saving…" : "Create rail"}
          </button>
        </div>
      </form>
    </div>
  );
}
