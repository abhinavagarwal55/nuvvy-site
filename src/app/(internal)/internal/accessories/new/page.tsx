"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/catalog/catalogProductLabels";
import type { CatalogProductCategory } from "@/lib/catalog/catalogProductTypes";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export default function NewAccessoryPage() {
  const router = useRouter();
  const [urlPaste, setUrlPaste] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedImageUrl, setParsedImageUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "" as "" | CatalogProductCategory,
    amazon_asin: "",
    amazon_url: "",
    price_inr: "" as "" | number,
    description: "",
    notes_internal: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ msg: string; existingId?: string } | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  async function handleParse() {
    if (!urlPaste.trim()) return;
    setParsing(true);
    setParseInfo(null);
    try {
      const res = await fetch("/api/internal/accessories/asin-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlPaste.trim() }),
      });
      const json = await res.json();
      if (json.asin) {
        setForm((f) => ({
          ...f,
          amazon_asin: json.asin,
          amazon_url: json.canonical_url ?? urlPaste.trim(),
          // Pre-fill name from OG scrape if user hasn't typed one yet
          name: f.name || (json.name ?? ""),
        }));
        setParsedImageUrl(json.image_url ?? null);
        const filled: string[] = ["ASIN"];
        if (json.name) filled.push("name");
        if (json.image_url) filled.push("image");
        setParseInfo(
          json.name || json.image_url
            ? `Pre-filled: ${filled.join(", ")}. Price still needs to be entered manually.`
            : "ASIN extracted. (Name/image not available from this page — fill manually.)"
        );
        setError(null);
      } else {
        setError({ msg: "Couldn't find an ASIN in that URL — paste a /dp/ link or fill ASIN manually." });
      }
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.category) {
      setError({ msg: "Name and category are required" });
      return;
    }
    if (!form.amazon_asin.trim() && !form.amazon_url.trim()) {
      setError({ msg: "Provide an Amazon ASIN or URL" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/internal/accessories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          category: form.category,
          amazon_asin: form.amazon_asin.trim() || null,
          amazon_url: form.amazon_url.trim() || null,
          price_inr: form.price_inr === "" ? null : Number(form.price_inr),
          price_snapshot_at:
            form.price_inr === "" ? null : new Date().toISOString(),
          description: form.description.trim() || null,
          notes_internal: form.notes_internal.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setError({ msg: json.error, existingId: json.existing_id });
        return;
      }
      if (!res.ok) {
        setError({ msg: json.error || "Failed to save" });
        return;
      }
      const createdId = json.data.id;
      // If parse pulled an OG image, mirror it now (best-effort; failure
      // is non-fatal — user can re-upload from the edit page).
      if (parsedImageUrl) {
        try {
          await fetch(`/api/internal/accessories/${createdId}/image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ remote_url: parsedImageUrl }),
          });
        } catch {
          /* swallow — edit page still lets them upload */
        }
      }
      router.push(`/internal/accessories/${createdId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hidden md:block max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">New Accessory</h1>
        <Link href="/internal/accessories" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back
        </Link>
      </div>

      {/* URL parse helper */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
        <label className="block text-xs font-medium text-blue-900 mb-1">
          Paste an Amazon URL to auto-fill ASIN
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className={inputCls + " flex-1"}
            placeholder="https://www.amazon.in/dp/B08X4M9TM3/…"
            value={urlPaste}
            onChange={(e) => setUrlPaste(e.target.value)}
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !urlPaste.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
          >
            {parsing ? "Parsing…" : "Parse"}
          </button>
        </div>
        {parseInfo && (
          <p className="text-xs text-blue-900 mt-2">{parseInfo}</p>
        )}
        {parsedImageUrl && (
          <div className="flex items-center gap-2 mt-2 text-xs text-blue-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={parsedImageUrl}
              alt="Preview"
              className="w-10 h-10 rounded object-cover border border-blue-200"
            />
            <span>Image will be mirrored to Supabase Storage on save.</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
            <select
              className={inputCls}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CatalogProductCategory }))}
              required
            >
              <option value="">Select…</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
            <input
              type="text"
              className={inputCls}
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amazon ASIN</label>
            <input
              type="text"
              className={inputCls + " font-mono"}
              placeholder="B0XXXXXXXX"
              value={form.amazon_asin}
              onChange={(e) => setForm((f) => ({ ...f, amazon_asin: e.target.value.toUpperCase() }))}
              maxLength={10}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Price (INR)</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.price_inr}
              onChange={(e) =>
                setForm((f) => ({ ...f, price_inr: e.target.value === "" ? "" : Number(e.target.value) }))
              }
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amazon URL (fallback)</label>
          <input
            type="text"
            className={inputCls}
            placeholder="https://www.amazon.in/..."
            value={form.amazon_url}
            onChange={(e) => setForm((f) => ({ ...f, amazon_url: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            rows={3}
            className={inputCls}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Internal notes (not shown to customers)</label>
          <textarea
            rows={2}
            className={inputCls}
            value={form.notes_internal}
            onChange={(e) => setForm((f) => ({ ...f, notes_internal: e.target.value }))}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error.msg}
            {error.existingId && (
              <>
                {" — "}
                <Link href={`/internal/accessories/${error.existingId}`} className="underline">
                  View existing product
                </Link>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Link
            href="/internal/accessories"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
          >
            {submitting ? "Saving…" : "Save & Publish"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          New accessories go live immediately. Use the edit page to demote to Draft / Unavailable later.
        </p>
      </form>
    </div>
  );
}
