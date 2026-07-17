"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ListChecks,
  Loader2,
  Plus,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { PlantOrderStatus } from "@/lib/schemas/plant-order";

type CuratedSummary = {
  order_status: PlantOrderStatus;
  curated_list_confirmed_at: string | null;
  confirmation_warning: boolean;
  list: { id: string; status: string; items: { type: string }[] };
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_CUSTOMER: "Sent to customer",
  CUSTOMER_SUBMITTED: "Confirmed by customer",
  SENT_BACK_TO_CUSTOMER: "Edited — re-send pending",
  TO_BE_PROCURED: "To be procured",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-stone/20 text-charcoal",
  SENT_TO_CUSTOMER: "bg-blue-50 text-blue-700",
  CUSTOMER_SUBMITTED: "bg-forest/10 text-forest",
  SENT_BACK_TO_CUSTOMER: "bg-amber-50 text-amber-700",
  TO_BE_PROCURED: "bg-forest text-offwhite",
};

export default function CuratedListPanel({
  orderId,
  orderStatus,
}: {
  orderId: string;
  orderStatus: PlantOrderStatus;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<CuratedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editorHref = `/ops/plant-orders/${orderId}/curated-list`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list`);
    if (res.ok) {
      const json = await res.json();
      setData(json.data ?? null);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = orderStatus === "interested" || orderStatus === "finalizing";

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ops/plant-orders/${orderId}/curated-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "Failed to create curated list");
      return;
    }
    router.push(editorHref); // straight into the full editor
  }

  if (loading) {
    return (
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 flex items-center gap-2 text-sm text-sage">
        <Loader2 size={16} className="animate-spin text-forest" /> Loading curated list…
      </div>
    );
  }

  // ── No list yet ────────────────────────────────────────────────────────────
  if (!data) {
    if (!editable) return null;
    return (
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks size={16} className="text-forest" />
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Curated plant list</p>
        </div>
        <p className="text-sm text-charcoal mb-3">
          Build a shortlist for this customer, send them a link, and their confirmation will
          fill in this order automatically.
        </p>
        {error && <p className="text-sm text-terra mb-2">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite text-sm font-medium rounded-xl hover:bg-garden disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create Curated Plant List
        </button>
      </div>
    );
  }

  const status = data.list.status;
  const plantCount = data.list.items.filter((i) => i.type === "plant").length;

  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-forest" />
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Curated plant list</p>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[status] ?? "bg-stone/20 text-charcoal"}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {data.confirmation_warning && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            The customer confirmed this list, but the order was no longer in
            &ldquo;Finalizing&rdquo;, so nothing was applied automatically.
          </p>
        </div>
      )}

      {status === "CUSTOMER_SUBMITTED" && !data.confirmation_warning && (
        <div className="flex items-start gap-2 bg-forest/5 border border-forest/20 rounded-xl p-3">
          <CheckCircle2 size={15} className="text-forest flex-shrink-0 mt-0.5" />
          <p className="text-xs text-forest">
            Confirmed by the customer
            {data.curated_list_confirmed_at &&
              ` on ${new Date(data.curated_list_confirmed_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`}
            . The chosen plants are in this order&rsquo;s items below.
          </p>
        </div>
      )}

      <p className="text-sm text-charcoal">
        {plantCount === 0 ? "No plants added yet." : `${plantCount} plant${plantCount === 1 ? "" : "s"} on the list.`}
      </p>

      <button
        onClick={() => router.push(editorHref)}
        className="flex items-center gap-1.5 px-3 py-2 border border-stone text-charcoal text-sm font-medium rounded-xl hover:bg-cream transition-colors"
      >
        Open Curated Plant List
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
