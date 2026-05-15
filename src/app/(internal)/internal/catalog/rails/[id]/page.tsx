"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import AddItemsModal from "./AddItemsModal";

type Rail = {
  id: string;
  title: string;
  subtitle: string | null;
  segment: "plants" | "accessories";
  status: "draft" | "active" | "inactive";
  display_order: number;
  cta_label: string | null;
  cta_link: string | null;
  notes_internal: string | null;
  updated_at: string;
};

type Item = {
  id: string;
  position: number;
  type: "plant" | "accessory";
  plant_id: string | null;
  catalog_product_id: string | null;
  underlying_available: boolean;
  plant: {
    id: string;
    name: string;
    scientific_name: string | null;
    price_band: string | null;
    thumbnail_url: string | null;
    thumbnail_storage_url: string | null;
    can_be_procured: boolean | null;
  } | null;
  catalog_product: {
    id: string;
    name: string;
    brand: string | null;
    category: string;
    price_inr: number | null;
    status: string;
    thumbnail_url: string | null;
    thumbnail_storage_url: string | null;
  } | null;
};

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_CLS: Record<Rail["status"], string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  inactive: "bg-red-100 text-red-700 border-red-200",
};

export default function EditRailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [rail, setRail] = useState<Rail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    cta_label: "",
    cta_link: "",
    notes_internal: "",
    display_order: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/internal/catalog/rails/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setLoading(false);
      return;
    }
    setRail(json.data.rail);
    setItems(json.data.items);
    setForm({
      title: json.data.rail.title,
      subtitle: json.data.rail.subtitle ?? "",
      cta_label: json.data.rail.cta_label ?? "",
      cta_link: json.data.rail.cta_link ?? "",
      notes_internal: json.data.rail.notes_internal ?? "",
      display_order: json.data.rail.display_order,
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMetadata() {
    setSaving(true);
    setError(null);
    const hasLabel = Boolean(form.cta_label.trim());
    const hasLink = Boolean(form.cta_link.trim());
    if (hasLabel !== hasLink) {
      setError("Provide both CTA label and CTA link, or neither.");
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/internal/catalog/rails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        cta_label: form.cta_label.trim() || null,
        cta_link: form.cta_link.trim() || null,
        notes_internal: form.notes_internal.trim() || null,
        display_order: form.display_order,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Save failed");
      return;
    }
    setRail(json.data);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 1800);
  }

  async function changeStatus(next: Rail["status"]) {
    const res = await fetch(`/api/internal/catalog/rails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return;
    }
    setRail(json.data);
  }

  async function softDelete() {
    if (!confirm("Mark this rail inactive? Customers will stop seeing it.")) return;
    const res = await fetch(`/api/internal/catalog/rails/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to delete");
      return;
    }
    router.push("/internal/catalog/rails");
  }

  async function moveItem(item: Item, direction: -1 | 1) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setItems(next);
    await fetch(`/api/internal/catalog/rails/${id}/items/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_item_ids: next.map((i) => i.id) }),
    });
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/internal/catalog/rails/${id}/items/${itemId}`, {
      method: "DELETE",
    });
    setPendingRemoveId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to remove");
      return;
    }
    load();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (!rail) {
    return (
      <p className="p-6 text-sm text-red-600">
        {error ?? "Not found"}{" "}
        <Link href="/internal/catalog/rails" className="underline">Back</Link>
      </p>
    );
  }

  const alreadyAddedIds = new Set(
    rail.segment === "plants"
      ? items.map((i) => i.plant_id).filter((x): x is string => Boolean(x))
      : items.map((i) => i.catalog_product_id).filter((x): x is string => Boolean(x))
  );

  return (
    <div className="hidden md:block max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/internal/catalog/rails" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to rails
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">{rail.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200 capitalize">
            {rail.segment}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_CLS[rail.status]}`}>
            {rail.status}
          </span>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-800">{msg}</div>}

      {/* Metadata */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Subtitle</label>
          <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">CTA label</label>
            <input className={inputCls} value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">CTA link</label>
            <input className={inputCls} value={form.cta_link} onChange={(e) => setForm((f) => ({ ...f, cta_link: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Display order</label>
          <input
            type="number"
            className={inputCls + " w-32"}
            value={form.display_order}
            onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))}
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
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={saveMetadata} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
            {saving ? "Saving…" : "Save"}
          </button>
          {(["draft", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={s === rail.status}
              onClick={() => changeStatus(s)}
              className={`px-3 py-2 text-xs font-medium border rounded-lg ${
                s === rail.status ? STATUS_CLS[s] : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s === "inactive" ? "Mark inactive" : s === "active" ? "Activate" : "Move to draft"}
            </button>
          ))}
          <button onClick={softDelete} className="ml-auto text-xs text-red-600 hover:text-red-800">
            Soft delete
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Items</h2>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} in rail</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            {rail.segment === "plants" ? "+ Add Plants" : "+ Add Accessories"}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            This rail has no items yet. Click {rail.segment === "plants" ? `"+ Add Plants"` : `"+ Add Accessories"`} to start curating.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item, idx) => {
              const isAccessory = item.type === "accessory";
              const name = isAccessory ? item.catalog_product?.name : item.plant?.name;
              const sub = isAccessory
                ? [item.catalog_product?.brand, item.catalog_product?.price_inr != null ? `₹${item.catalog_product.price_inr.toLocaleString("en-IN")}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : [item.plant?.scientific_name, item.plant?.price_band].filter(Boolean).join(" · ");
              const thumb =
                (isAccessory ? item.catalog_product?.thumbnail_storage_url || item.catalog_product?.thumbnail_url : item.plant?.thumbnail_storage_url || item.plant?.thumbnail_url) || null;
              return (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveItem(item, -1)}
                      disabled={idx === 0}
                      className="px-1.5 py-0.5 border border-gray-300 rounded text-xs disabled:opacity-30 hover:bg-gray-100"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(item, 1)}
                      disabled={idx === items.length - 1}
                      className="px-1.5 py-0.5 border border-gray-300 rounded text-xs disabled:opacity-30 hover:bg-gray-100"
                    >
                      ↓
                    </button>
                  </div>
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt={name ?? ""}
                      width={48}
                      height={48}
                      className="rounded object-cover border border-gray-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                    {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
                    {!item.underlying_available && (
                      <span className="inline-block mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        Currently unavailable
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingRemoveId(item.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddModal && (
        <AddItemsModal
          railId={id}
          segment={rail.segment}
          alreadyAddedIds={alreadyAddedIds}
          onClose={() => setShowAddModal(false)}
          onAdded={load}
        />
      )}

      {pendingRemoveId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h3 className="font-semibold text-gray-900 mb-2">Remove from rail?</h3>
            <p className="text-sm text-gray-700 mb-4">
              The underlying {rail.segment === "plants" ? "plant" : "accessory"} is not deleted — it just won't appear in this rail anymore.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingRemoveId(null)} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => removeItem(pendingRemoveId)} className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
