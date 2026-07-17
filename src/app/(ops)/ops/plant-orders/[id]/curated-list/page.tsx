"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Sprout,
  Trash2,
  Send,
  Link2,
  Copy,
  Check,
  RefreshCw,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  ChevronUp,
  ChevronDown,
  Plus,
} from "lucide-react";
import PlantSelector from "@/components/ops/PlantSelector";
import TemplatePicker from "@/components/ops/TemplatePicker";
import AccessoryPicker, { type AccessoryResult } from "@/components/ops/AccessoryPicker";
import { Package } from "lucide-react";

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

type CuratedPlant = {
  id: string;
  name: string;
  scientific_name: string | null;
  price_band: string | null;
  thumbnail_url: string | null;
  thumbnail_storage_url: string | null;
};

type CuratedAccessory = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price_inr: number | null;
  status: string;
  thumbnail_url: string | null;
  thumbnail_storage_url: string | null;
  image_url?: string | null;
  image_storage_url?: string | null;
};

type CuratedItem = {
  id: string;
  plant_id: string | null;
  catalog_product_id?: string | null;
  section_id: string | null;
  type: "plant" | "accessory";
  quantity: number | null;
  note: string | null;
  why_picked_for_balcony: string | null;
  plant: CuratedPlant | null;
  catalog_product?: CuratedAccessory | null;
};

type CuratedSection = {
  id: string;
  name: string;
  sort_order: number;
  items: CuratedItem[];
  accessories: CuratedItem[];
};

type CuratedData = {
  order_status: string;
  curated_list_confirmed_at: string | null;
  confirmation_warning: boolean;
  public_url: string | null;
  customer: { id: string; name: string; address: string | null } | null;
  list: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    current_version_number: number;
    sections: CuratedSection[];
    items: CuratedItem[];
  };
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_CUSTOMER: "Sent to customer",
  CUSTOMER_SUBMITTED: "Confirmed by customer",
  SENT_BACK_TO_CUSTOMER: "Editing — re-send pending",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-stone/20 text-charcoal",
  SENT_TO_CUSTOMER: "bg-blue-50 text-blue-700",
  CUSTOMER_SUBMITTED: "bg-forest/10 text-forest",
  SENT_BACK_TO_CUSTOMER: "bg-amber-50 text-amber-700",
};

function parsePriceBand(band: string | null | undefined): { min: number; max: number } | null {
  if (!band) return null;
  const nums = band.match(/\d+/g);
  if (nums && nums.length >= 2) {
    const min = parseInt(nums[0], 10);
    const max = parseInt(nums[1], 10);
    if (min > 0 && max >= min) return { min, max };
  }
  return null;
}

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const MAX_SECTIONS = 10;

export default function CuratedListEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: orderId } = use(params);

  const [data, setData] = useState<CuratedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<Map<string, { quantity: string; note: string }>>(new Map());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<string | null>(null);
  const [templateTargetSection, setTemplateTargetSection] = useState<string | null>(null);
  const [selectorBump, setSelectorBump] = useState<Record<string, number>>({});
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const sectionInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [accessoryPickerSection, setAccessoryPickerSection] = useState<string | null>(null);

  // After a new section is added, focus + select its name input for inline typing.
  useEffect(() => {
    if (!focusSectionId) return;
    const el = sectionInputRefs.current.get(focusSectionId);
    if (el) {
      el.focus();
      el.select();
    }
    setFocusSectionId(null);
  }, [focusSectionId]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list`);
    if (res.ok) {
      const json = await res.json();
      const d: CuratedData | null = json.data ?? null;
      setData(d);
      if (d) {
        setTitle(d.list.title ?? "");
        setDescription(d.list.description ?? "");
        const m = new Map<string, { quantity: string; note: string }>();
        d.list.sections.forEach((s) =>
          s.items.forEach((i) => {
            m.set(i.id, { quantity: i.quantity != null ? String(i.quantity) : "", note: i.note ?? "" });
          })
        );
        setForm(m);
      }
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const status = data?.list.status ?? "DRAFT";
  const orderEditable = data?.order_status === "interested" || data?.order_status === "finalizing";
  const isSent = status === "SENT_TO_CUSTOMER";
  const isConfirmed = status === "CUSTOMER_SUBMITTED";
  const editable = orderEditable && (status === "DRAFT" || status === "SENT_BACK_TO_CUSTOMER");
  const sections = data?.list.sections ?? [];

  function setItem(itemId: string, patch: Partial<{ quantity: string; note: string }>) {
    setForm((prev) => {
      const m = new Map(prev);
      const cur = m.get(itemId) ?? { quantity: "", note: "" };
      m.set(itemId, { ...cur, ...patch });
      return m;
    });
  }

  async function call(path: string, options: RequestInit, errLabel: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(path, options);
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : errLabel);
      return false;
    }
    return true;
  }

  // ── Plant items ─────────────────────────────────────────────────────────────
  async function handleAddPlant(sectionId: string, airtableId: string) {
    setSelectorBump((b) => ({ ...b, [sectionId]: (b[sectionId] ?? 0) + 1 }));
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ airtable_id: airtableId, section_id: sectionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to add plant");
      return;
    }
    const json = await res.json();
    const added = json.data as { id: string; plant_id: string; section_id: string | null; plant: CuratedPlant } | null;
    if (!added?.id) return;
    setData((prev) => {
      if (!prev) return prev;
      const already = prev.list.sections.some((s) => s.items.some((i) => i.id === added.id));
      if (already) return prev;
      const newItem: CuratedItem = {
        id: added.id,
        plant_id: added.plant_id,
        section_id: added.section_id ?? sectionId,
        type: "plant",
        quantity: null,
        note: null,
        why_picked_for_balcony: null,
        plant: added.plant,
      };
      return {
        ...prev,
        list: {
          ...prev.list,
          sections: prev.list.sections.map((s) =>
            s.id === sectionId ? { ...s, items: [...s.items, newItem] } : s
          ),
        },
      };
    });
    setForm((prev) => {
      if (prev.has(added.id)) return prev;
      const m = new Map(prev);
      m.set(added.id, { quantity: "", note: "" });
      return m;
    });
  }

  async function handleRemove(itemId: string) {
    const ok = await call(
      `/api/ops/plant-orders/${orderId}/curated-list/items/${itemId}`,
      { method: "DELETE" },
      "Failed to remove item"
    );
    if (!ok) return;
    setData((prev) =>
      prev
        ? {
            ...prev,
            list: {
              ...prev.list,
              sections: prev.list.sections.map((s) => ({
                ...s,
                items: s.items.filter((i) => i.id !== itemId),
                accessories: s.accessories.filter((i) => i.id !== itemId),
              })),
            },
          }
        : prev
    );
  }

  async function handleAddAccessory(sectionId: string, product: AccessoryResult) {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog_product_id: product.id, section_id: sectionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to add accessory");
      return;
    }
    const json = await res.json();
    const added = json.data as { id: string; catalog_product_id: string; catalog_product: CuratedAccessory } | null;
    if (!added?.id) return;
    setData((prev) => {
      if (!prev) return prev;
      const already = prev.list.sections.some((s) => s.accessories.some((a) => a.id === added.id));
      if (already) return prev;
      const newItem: CuratedItem = {
        id: added.id,
        plant_id: null,
        catalog_product_id: added.catalog_product_id,
        section_id: sectionId,
        type: "accessory",
        quantity: null,
        note: null,
        why_picked_for_balcony: null,
        plant: null,
        catalog_product: added.catalog_product,
      };
      return {
        ...prev,
        list: {
          ...prev.list,
          sections: prev.list.sections.map((s) =>
            s.id === sectionId ? { ...s, accessories: [...s.accessories, newItem] } : s
          ),
        },
      };
    });
  }

  // ── Sections ────────────────────────────────────────────────────────────────
  async function handleAddSection() {
    if (sections.length >= MAX_SECTIONS) {
      setError(`A curated list can have at most ${MAX_SECTIONS} sections.`);
      return;
    }
    // Create with a default name, then focus its inline input so the user can
    // just type the real name (no popup).
    const defaultName = `Section ${sections.length + 1}`;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: defaultName }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to add section");
      return;
    }
    const json = await res.json();
    const newId = json.data?.id as string | undefined;
    await load();
    if (newId) setFocusSectionId(newId);
  }

  async function handleRenameSection(sectionId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await call(
      `/api/ops/plant-orders/${orderId}/curated-list/sections/${sectionId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) },
      "Failed to rename section"
    );
  }

  function updateSectionNameLocal(sectionId: string, name: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            list: {
              ...prev.list,
              sections: prev.list.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)),
            },
          }
        : prev
    );
  }

  async function handleReorderSection(sectionId: string, dir: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === sectionId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sections.length) return;
    const a = sections[idx];
    const b = sections[target];
    setBusy(true);
    setError(null);
    // Swap their sort_order values.
    await fetch(`/api/ops/plant-orders/${orderId}/curated-list/sections/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: b.sort_order }),
    });
    await fetch(`/api/ops/plant-orders/${orderId}/curated-list/sections/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: a.sort_order }),
    });
    setBusy(false);
    await load();
  }

  async function handleDeleteSection(sectionId: string) {
    if (sections.length <= 1) {
      setError("A curated list must keep at least one section.");
      return;
    }
    if (!window.confirm("Delete this section and all its plants? This cannot be undone.")) return;
    const ok = await call(
      `/api/ops/plant-orders/${orderId}/curated-list/sections/${sectionId}`,
      { method: "DELETE" },
      "Failed to delete section"
    );
    if (ok) await load();
  }

  // ── Save / send / revise ─────────────────────────────────────────────────────
  function buildItemsPayload() {
    return Array.from(form.entries()).map(([id, v]) => {
      const q = parseInt(v.quantity, 10);
      return { id, quantity: isNaN(q) ? null : q, note: v.note.trim() || null };
    });
  }

  async function handleSave(): Promise<boolean> {
    if (!title.trim()) {
      setError("Give the list a name before saving.");
      return false;
    }
    const metaOk = await call(
      `/api/ops/plant-orders/${orderId}/curated-list`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), description: description.trim() || null }) },
      "Failed to save list details"
    );
    if (!metaOk) return false;
    const ok = await call(
      `/api/ops/plant-orders/${orderId}/curated-list/items`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: buildItemsPayload() }) },
      "Failed to save"
    );
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    return ok;
  }

  async function handleSend() {
    if (!(await handleSave())) return;
    const ok = await call(`/api/ops/plant-orders/${orderId}/curated-list/send`, { method: "POST" }, "Failed to send");
    if (ok) await load();
  }

  async function handleRevise() {
    const ok = await call(`/api/ops/plant-orders/${orderId}/curated-list/revise`, { method: "POST" }, "Failed to start editing");
    if (ok) await load();
  }

  // ── Templates ────────────────────────────────────────────────────────────────
  function openTemplateForSection(sectionId: string) {
    setTemplateTargetSection(sectionId);
    setShowTemplatePicker(true);
  }

  async function handleApplyTemplate(templateId: string) {
    setApplyingTemplateId(templateId);
    setError(null);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, section_id: templateTargetSection ?? undefined }),
    });
    setApplyingTemplateId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to apply template");
      return;
    }
    const json = await res.json();
    const { added, skipped_duplicate, skipped_unavailable } = json.data ?? {};
    const parts = [`${added ?? 0} added`];
    if (skipped_duplicate) parts.push(`${skipped_duplicate} skipped (already in list)`);
    if (skipped_unavailable) parts.push(`${skipped_unavailable} skipped (unavailable)`);
    setApplySummary(parts.join(", "));
    setShowTemplatePicker(false);
    setTemplateTargetSection(null);
    await load();
    setTimeout(() => setApplySummary(null), 6000);
  }

  async function copyLink() {
    if (!data?.public_url) return;
    try {
      await navigator.clipboard.writeText(data.public_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* link is still visible */
    }
  }

  const thumbOf = (p: CuratedPlant | null) => p?.thumbnail_storage_url || p?.thumbnail_url || null;

  // Estimated cost helpers (client-side from price bands).
  function sectionCost(sec: CuratedSection): { min: number; max: number } | null {
    let min = 0;
    let max = 0;
    let any = false;
    sec.items.forEach((item) => {
      const q = parseInt(form.get(item.id)?.quantity ?? "", 10);
      if (isNaN(q) || q <= 0) return;
      const band = parsePriceBand(item.plant?.price_band);
      if (band) {
        min += band.min * q;
        max += band.max * q;
        any = true;
      }
    });
    return any ? { min, max } : null;
  }

  const grandTotal = (() => {
    let min = 0;
    let max = 0;
    let any = false;
    sections.forEach((sec) => {
      const c = sectionCost(sec);
      if (c) {
        min += c.min;
        max += c.max;
        any = true;
      }
    });
    return any ? { min, max } : null;
  })();

  const totalPlantCount = sections.reduce((n, s) => n + s.items.length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-forest" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-charcoal">No curated list exists for this order yet.</p>
        <button
          onClick={() => router.push(`/ops/plant-orders/${orderId}`)}
          className="px-4 py-2 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite"
        >
          Back to order
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-40">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/ops/plant-orders/${orderId}`)} className="text-charcoal hover:text-forest">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl text-charcoal truncate" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
              Curated Plant List
            </h1>
            <p className="text-xs text-sage truncate">
              {data.customer?.name ?? "Customer"}
              {data.customer?.address ? ` · ${data.customer.address}` : ""}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[status] ?? "bg-stone/20 text-charcoal"}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[820px] mx-auto">
        {/* Banners */}
        {error && <div className="bg-terra/5 border border-terra/30 rounded-xl p-3 text-sm text-terra">{error}</div>}
        {saved && <div className="bg-forest/5 border border-forest/20 rounded-xl p-3 text-sm text-forest">Draft saved.</div>}
        {applySummary && (
          <div className="bg-forest/5 border border-forest/20 rounded-xl p-3 text-sm text-forest">Template applied — {applySummary}.</div>
        )}

        {data.confirmation_warning && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The customer confirmed this list, but the order was no longer in &ldquo;Finalizing&rdquo;, so nothing was
              applied automatically. Review and add plants to the order manually if needed.
            </p>
          </div>
        )}

        {isConfirmed && !data.confirmation_warning && (
          <div className="flex items-start gap-2 bg-forest/5 border border-forest/20 rounded-xl p-3">
            <CheckCircle2 size={16} className="text-forest flex-shrink-0 mt-0.5" />
            <p className="text-sm text-forest">
              Confirmed by the customer
              {data.curated_list_confirmed_at &&
                ` on ${new Date(data.curated_list_confirmed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              . This list is locked; the chosen plants are on the order&rsquo;s items.
            </p>
          </div>
        )}

        {isSent && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <Send size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              This list has been sent — the customer is reviewing it. Use <strong>Edit list</strong> to make changes and re-send.
            </p>
          </div>
        )}

        {/* Shareable link */}
        {data.public_url && (
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
            <label className="flex items-center gap-1.5 text-xs text-sage mb-1">
              <Link2 size={13} /> Customer link
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={data.public_url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 border border-stone rounded-xl text-xs text-charcoal bg-cream focus:outline-none"
              />
              <button onClick={copyLink} className="px-3 py-2 border border-stone text-charcoal text-xs font-medium rounded-xl hover:bg-cream whitespace-nowrap flex items-center gap-1">
                {copied ? <Check size={13} className="text-forest" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-sage mt-1">Share this over WhatsApp with the customer.</p>
          </div>
        )}

        {/* List details */}
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">List details</p>
          {editable ? (
            <>
              <div>
                <label className="block text-[11px] text-sage mb-1">List name</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Balcony starter set" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-[11px] text-sage mb-1">
                  Description <span className="text-stone">(optional — shown to the customer)</span>
                </label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note about this selection…" className={`${INPUT_CLS} min-h-[44px]`} />
              </div>
              <p className="text-[11px] text-sage">Saved with “Save draft” or when you send the list.</p>
            </>
          ) : (
            <>
              <p className="text-base text-charcoal" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
                {title || "Untitled list"}
              </p>
              {description && <p className="text-sm text-sage">{description}</p>}
            </>
          )}
        </div>

        {/* Sections */}
        {sections.map((sec, sIdx) => {
          const cost = sectionCost(sec);
          return (
            <div key={sec.id} className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2">
                {editable ? (
                  <input
                    ref={(el) => {
                      if (el) sectionInputRefs.current.set(sec.id, el);
                      else sectionInputRefs.current.delete(sec.id);
                    }}
                    value={sec.name}
                    onChange={(e) => updateSectionNameLocal(sec.id, e.target.value)}
                    onBlur={(e) => handleRenameSection(sec.id, e.target.value)}
                    placeholder="Section name"
                    className="flex-1 min-w-0 px-2 py-1.5 border border-stone rounded-lg text-sm font-medium text-charcoal bg-offwhite focus:outline-none focus:border-forest"
                  />
                ) : (
                  <p className="flex-1 min-w-0 text-sm font-medium text-charcoal truncate">{sec.name}</p>
                )}
                <span className="text-[11px] text-sage whitespace-nowrap">{sec.items.length} plant{sec.items.length === 1 ? "" : "s"}</span>
                {editable && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => handleReorderSection(sec.id, -1)} disabled={busy || sIdx === 0} className="p-1 text-stone hover:text-charcoal disabled:opacity-30" aria-label="Move section up">
                      <ChevronUp size={16} />
                    </button>
                    <button onClick={() => handleReorderSection(sec.id, 1)} disabled={busy || sIdx === sections.length - 1} className="p-1 text-stone hover:text-charcoal disabled:opacity-30" aria-label="Move section down">
                      <ChevronDown size={16} />
                    </button>
                    <button onClick={() => handleDeleteSection(sec.id)} disabled={busy || sections.length <= 1} className="p-1 text-stone hover:text-terra disabled:opacity-30" aria-label="Delete section">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* Section plants */}
              {sec.items.length === 0 ? (
                <p className="text-sm text-stone">No plants in this section yet.</p>
              ) : (
                <div className="space-y-2">
                  {sec.items.map((item) => {
                    const f = form.get(item.id) ?? { quantity: "", note: "" };
                    const q = parseInt(f.quantity, 10);
                    const band = parsePriceBand(item.plant?.price_band);
                    const itemCost = !isNaN(q) && q > 0 && band ? { min: band.min * q, max: band.max * q } : null;
                    const thumb = thumbOf(item.plant);
                    return (
                      <div key={item.id} className="border border-stone/40 rounded-xl p-2.5">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex gap-2.5 sm:w-[46%] sm:flex-shrink-0">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt={item.plant?.name ?? "Plant"} className="w-11 h-11 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                            ) : (
                              <div className="w-11 h-11 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Sprout size={18} className="text-forest" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-charcoal leading-tight">{item.plant?.name ?? "Plant"}</p>
                              {item.plant?.scientific_name && <p className="text-[11px] text-sage italic truncate">{item.plant.scientific_name}</p>}
                              {item.plant?.price_band && <p className="text-[11px] text-sage">{item.plant.price_band}</p>}
                              <div className="flex items-center gap-2 mt-1.5">
                                {editable ? (
                                  <div className="flex items-center border border-stone rounded-lg overflow-hidden">
                                    <button type="button" onClick={() => setItem(item.id, { quantity: String(Math.max(0, (isNaN(q) ? 0 : q) - 1) || "") })} className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-cream">−</button>
                                    <input type="number" min={1} value={f.quantity} onChange={(e) => setItem(item.id, { quantity: e.target.value })} placeholder="—" className="w-9 text-center text-sm text-charcoal bg-offwhite focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                    <button type="button" onClick={() => setItem(item.id, { quantity: String((isNaN(q) ? 0 : q) + 1) })} className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-cream">+</button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-sage">Qty: {f.quantity || "—"}</span>
                                )}
                                {itemCost && <span className="text-[11px] text-sage">{money(itemCost.min)}–{money(itemCost.max)}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 flex items-start gap-2">
                            {editable ? (
                              <textarea rows={2} value={f.note} onChange={(e) => setItem(item.id, { note: e.target.value })} placeholder="Care notes, why picked…" className={`${INPUT_CLS} flex-1 min-h-[44px] py-1.5`} />
                            ) : (
                              <p className="flex-1 text-xs text-charcoal">{f.note || <span className="text-stone">—</span>}</p>
                            )}
                            {editable && (
                              <button onClick={() => handleRemove(item.id)} disabled={busy} className="text-stone hover:text-terra disabled:opacity-40 flex-shrink-0 mt-1" aria-label="Remove plant">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Section add controls */}
              {editable && (
                <div className="pt-2 border-t border-stone/30 space-y-2">
                  <PlantSelector
                    key={`sec-${sec.id}-${selectorBump[sec.id] ?? 0}`}
                    value={null}
                    onChange={(plant) => {
                      if (plant?.plant_id) handleAddPlant(sec.id, plant.plant_id);
                    }}
                  />
                  <button onClick={() => openTemplateForSection(sec.id)} className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream">
                    <ListChecks size={14} /> Add from template
                  </button>
                </div>
              )}

              {/* Recommended accessories for this section */}
              <div className="pt-2 border-t border-stone/30 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Package size={13} className="text-sage" />
                  <p className="text-[11px] font-medium text-sage uppercase tracking-widest">Recommended accessories</p>
                </div>
                {sec.accessories.length === 0 ? (
                  <p className="text-xs text-stone">
                    None yet — pots, baskets etc. the customer sees after confirming plants in this section.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {sec.accessories.map((acc) => {
                      const cp = acc.catalog_product;
                      const thumb =
                        cp?.thumbnail_storage_url || cp?.thumbnail_url || cp?.image_storage_url || cp?.image_url || null;
                      return (
                        <div key={acc.id} className="flex items-center gap-2.5 border border-stone/40 rounded-lg p-2">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={cp?.name ?? "Accessory"} className="w-9 h-9 rounded-lg object-cover border border-stone/40 flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 bg-forest/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Package size={15} className="text-forest" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-charcoal truncate">{cp?.name ?? "Accessory"}</p>
                            <p className="text-[11px] text-sage truncate">
                              {cp?.brand ? `${cp.brand} · ` : ""}
                              {cp?.category ?? ""}
                              {cp?.price_inr != null ? ` · ₹${cp.price_inr.toLocaleString("en-IN")}` : ""}
                            </p>
                          </div>
                          {editable && (
                            <button onClick={() => handleRemove(acc.id)} disabled={busy} className="text-stone hover:text-terra disabled:opacity-40 flex-shrink-0" aria-label="Remove accessory">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {editable && (
                  <button
                    onClick={() => setAccessoryPickerSection(sec.id)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream"
                  >
                    <Plus size={14} /> Add accessory
                  </button>
                )}
              </div>

              {cost && (
                <div className="pt-2 border-t border-stone/30 flex items-center justify-between">
                  <span className="text-xs text-sage">Section subtotal</span>
                  <span className="text-sm text-charcoal">{money(Math.round((cost.min + cost.max) / 2))}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Add section */}
        {editable && (
          <button
            onClick={handleAddSection}
            disabled={busy || sections.length >= MAX_SECTIONS}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-dashed border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-offwhite disabled:opacity-40"
          >
            <Plus size={14} /> Add section {sections.length >= MAX_SECTIONS && `(max ${MAX_SECTIONS})`}
          </button>
        )}

        {/* Grand total */}
        {grandTotal && (
          <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-charcoal">Estimated total ({totalPlantCount} plant{totalPlantCount === 1 ? "" : "s"})</span>
            <div className="text-right">
              <p className="text-base font-semibold text-charcoal">{money(Math.round((grandTotal.min + grandTotal.max) / 2))}</p>
              <p className="text-[11px] text-sage">Varies {money(grandTotal.min)} – {money(grandTotal.max)} by nursery availability</p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-offwhite border-t border-stone p-4">
        <div className="max-w-[820px] mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.push(`/ops/plant-orders/${orderId}`)} className="px-4 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">
            Back to order
          </button>
          <div className="flex items-center gap-2">
            {editable && (
              <>
                <button onClick={handleSave} disabled={busy} className="flex items-center gap-1.5 px-4 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save draft
                </button>
                <button onClick={handleSend} disabled={busy || totalPlantCount === 0} className="flex items-center gap-1.5 px-4 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-40 transition-colors">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {status === "SENT_BACK_TO_CUSTOMER" ? "Re-send to customer" : "Send to customer"}
                </button>
              </>
            )}
            {isSent && orderEditable && (
              <button onClick={handleRevise} disabled={busy} className="flex items-center gap-1.5 px-4 py-2.5 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-40 transition-colors">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                Edit list
              </button>
            )}
            {isSent && (
              <button onClick={copyLink} className="flex items-center gap-1.5 px-4 py-2.5 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream">
                <RefreshCw size={14} /> Copy link
              </button>
            )}
          </div>
        </div>
      </div>

      {showTemplatePicker && (
        <TemplatePicker
          applyingId={applyingTemplateId}
          onSelect={handleApplyTemplate}
          onClose={() => {
            setShowTemplatePicker(false);
            setTemplateTargetSection(null);
          }}
        />
      )}

      {accessoryPickerSection && (
        <AccessoryPicker
          alreadyAddedIds={
            new Set(
              (sections.find((s) => s.id === accessoryPickerSection)?.accessories ?? [])
                .map((a) => a.catalog_product_id)
                .filter((x): x is string => Boolean(x))
            )
          }
          onSelect={(product) => handleAddAccessory(accessoryPickerSection, product)}
          onClose={() => setAccessoryPickerSection(null)}
        />
      )}
    </div>
  );
}
