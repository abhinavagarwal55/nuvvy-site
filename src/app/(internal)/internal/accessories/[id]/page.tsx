"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_BADGE_CLS,
  STATUS_LABELS,
  formatPriceInr,
} from "@/lib/catalog/catalogProductLabels";
import type {
  CatalogProduct,
  CatalogProductCategory,
  CatalogProductStatus,
} from "@/lib/catalog/catalogProductTypes";
import { buildAffiliateUrl } from "@/lib/catalog/affiliate";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const STATUSES: CatalogProductStatus[] = ["draft", "active", "unavailable", "inactive"];

export default function EditAccessoryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<CatalogProductStatus | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/internal/accessories/${id}`);
    const json = await res.json();
    if (res.ok) setProduct(json.data);
    else setErr(json.error || "Failed to load");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(updates: Partial<CatalogProduct>) {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/internal/accessories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || "Failed to save");
      return false;
    }
    setProduct(json.data);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 2000);
    return true;
  }

  async function handleStatusChange(next: CatalogProductStatus) {
    if (next === "inactive" && product?.status !== "inactive") {
      setConfirmStatus(next);
      return;
    }
    void doStatusChange(next);
  }

  async function doStatusChange(next: CatalogProductStatus) {
    setStatusBusy(true);
    const res = await fetch(`/api/internal/accessories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    setStatusBusy(false);
    if (!res.ok) {
      setErr(json.error || "Failed to change status");
      return;
    }
    setProduct(json.data);
    setConfirmStatus(null);
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`/api/internal/accessories/${id}/image`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) {
      setErr(json.error || "Image upload failed");
      return;
    }
    setProduct(json.data);
  }

  async function handleImageUrl(url: string) {
    setUploading(true);
    setErr(null);
    const res = await fetch(`/api/internal/accessories/${id}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remote_url: url }),
    });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) {
      setErr(json.error || "Image fetch failed");
      return;
    }
    setProduct(json.data);
  }

  async function handlePriceSnapshot() {
    const newPrice = prompt("New price in INR (whole rupees):");
    if (newPrice == null) return;
    const n = parseInt(newPrice, 10);
    if (isNaN(n) || n < 0) {
      setErr("Invalid price");
      return;
    }
    await handleSave({ price_inr: n, price_snapshot_at: new Date().toISOString() });
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (!product) {
    return (
      <p className="p-6 text-sm text-red-600">
        {err ?? "Not found"} <Link href="/internal/accessories" className="underline">Back</Link>
      </p>
    );
  }

  return (
    <div className="hidden md:block max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/internal/accessories" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to accessories
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">{product.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_BADGE_CLS[product.status]}`}
          >
            {STATUS_LABELS[product.status]}
          </span>
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{err}</div>
      )}
      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-800">{msg}</div>
      )}

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <FormFields
          product={product}
          onSave={(updates) => handleSave(updates)}
          saving={saving}
        />

        {/* Image */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Image</label>
          <div className="flex items-start gap-4">
            {product.image_storage_url || product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_storage_url || product.image_url || ""}
                alt={product.name}
                className="w-32 h-32 rounded object-cover border border-gray-200"
              />
            ) : (
              <div className="w-32 h-32 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                No image
              </div>
            )}
            <div className="flex-1 space-y-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                {uploading ? "Uploading…" : "Upload file"}
              </button>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={fileRef}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageFile(f);
                }}
              />
              <p className="text-xs text-gray-500">or</p>
              <ImageUrlForm onSubmit={handleImageUrl} disabled={uploading} />
            </div>
          </div>
        </div>

        {/* Price snapshot */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Price snapshot</label>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-700">
              {formatPriceInr(product.price_inr)}
              {product.price_snapshot_at && (
                <span className="ml-2 text-xs text-gray-500">
                  as of {new Date(product.price_snapshot_at).toLocaleDateString()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handlePriceSnapshot}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Status control */}
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => {
              const isCurrent = s === product.status;
              // Always color the Active pill green so it stands out as the
              // happy-path action; other statuses stay plain when not current.
              const cls = isCurrent
                ? STATUS_BADGE_CLS[s]
                : s === "active"
                  ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50";
              return (
                <button
                  key={s}
                  type="button"
                  disabled={statusBusy || isCurrent}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${cls} ${statusBusy ? "opacity-50" : ""}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview affiliate link */}
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Customer-facing link</label>
          {buildAffiliateUrl({ amazon_asin: product.amazon_asin, amazon_url: product.amazon_url }) ? (
            <a
              href={buildAffiliateUrl({ amazon_asin: product.amazon_asin, amazon_url: product.amazon_url })}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {buildAffiliateUrl({ amazon_asin: product.amazon_asin, amazon_url: product.amazon_url })}
            </a>
          ) : (
            <p className="text-sm text-gray-500">No ASIN or URL set yet.</p>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmStatus === "inactive" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h3 className="font-semibold text-gray-900 mb-2">Mark inactive?</h3>
            <p className="text-sm text-gray-700 mb-4">
              This will hide the product from customers. Existing shortlist references are preserved. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmStatus(null)}
                className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => doStatusChange("inactive")}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Mark inactive
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Created {new Date(product.created_at).toLocaleString()}{" "}
        {router && null /* keep router import live */}
      </p>
    </div>
  );
}

function FormFields({
  product,
  onSave,
  saving,
}: {
  product: CatalogProduct;
  onSave: (updates: Partial<CatalogProduct>) => Promise<boolean>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: product.name,
    brand: product.brand ?? "",
    category: product.category,
    amazon_asin: product.amazon_asin ?? "",
    amazon_url: product.amazon_url ?? "",
    description: product.description ?? "",
    notes_internal: product.notes_internal ?? "",
  });

  // Re-sync if product updates externally
  useEffect(() => {
    setForm({
      name: product.name,
      brand: product.brand ?? "",
      category: product.category,
      amazon_asin: product.amazon_asin ?? "",
      amazon_url: product.amazon_url ?? "",
      description: product.description ?? "",
      notes_internal: product.notes_internal ?? "",
    });
  }, [product]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category,
      amazon_asin: form.amazon_asin.trim() || null,
      amazon_url: form.amazon_url.trim() || null,
      description: form.description.trim() || null,
      notes_internal: form.notes_internal.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
          >
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
            value={form.amazon_asin}
            onChange={(e) => setForm((f) => ({ ...f, amazon_asin: e.target.value.toUpperCase() }))}
            maxLength={10}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amazon URL (fallback)</label>
          <input
            type="text"
            className={inputCls}
            value={form.amazon_url}
            onChange={(e) => setForm((f) => ({ ...f, amazon_url: e.target.value }))}
          />
        </div>
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
        <label className="block text-xs font-medium text-gray-700 mb-1">Internal notes</label>
        <textarea
          rows={2}
          className={inputCls}
          value={form.notes_internal}
          onChange={(e) => setForm((f) => ({ ...f, notes_internal: e.target.value }))}
        />
      </div>
      <div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function ImageUrlForm({ onSubmit, disabled }: { onSubmit: (url: string) => void; disabled: boolean }) {
  const [url, setUrl] = useState("");
  return (
    <div className="flex gap-2">
      <input
        type="text"
        className={inputCls + " flex-1"}
        placeholder="Paste image URL (Amazon CDN ok)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        type="button"
        disabled={disabled || !url.trim()}
        onClick={() => onSubmit(url.trim())}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40"
      >
        Mirror
      </button>
    </div>
  );
}
