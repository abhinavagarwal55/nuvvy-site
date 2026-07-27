"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, UserPlus, ArrowLeft, Check, Loader2 } from "lucide-react";
import { SlideUpModal, INPUT_CLS, fetcher, type DropdownOption } from "./shared";
import { ONDEMAND_SOURCES } from "@/lib/services/ondemand";

type OnDemandCustomer = {
  id: string;
  name: string;
  society: string | null;
  apartment_number: string | null;
  mobile: string | null;
  last_service_date?: string | null;
};

type OnDemandPlan = {
  id: string;
  name: string;
  hourly_rate: number | null;
};

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  "aviha.ai": "aviha.ai",
  referral: "Referral",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function OnDemandServiceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [step, setStep] = useState<"customer" | "quickadd" | "details">("customer");
  const [customer, setCustomer] = useState<OnDemandCustomer | null>(null);

  // Customer search
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OnDemandCustomer[]>([]);
  const [searching, setSearching] = useState(false);

  // Quick add. society_id = existing society; society = new society name.
  const [qa, setQa] = useState({ name: "", society_id: "", society: "", apartment_number: "", mobile: "", email: "", source: "direct" });
  const [qaSaving, setQaSaving] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  // Service details
  const [serviceDate, setServiceDate] = useState(todayStr());
  const [serviceTime, setServiceTime] = useState("10:00");
  const [planId, setPlanId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("1");
  const [gardenerId, setGardenerId] = useState("");
  const [specialTasks, setSpecialTasks] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: plansData } = useSWR(open ? "/api/ops/plans?type=ondemand&active=true" : null, fetcher);
  const plans: OnDemandPlan[] = plansData?.data ?? [];
  const { data: societiesData } = useSWR(open ? "/api/ops/societies" : null, fetcher);
  const societies: { id: string; name: string }[] = societiesData?.data ?? [];
  const { data: gardenersData } = useSWR(open ? "/api/ops/gardeners" : null, fetcher);
  const gardeners: DropdownOption[] = (gardenersData?.data ?? []).map(
    (g: { id: string; name: string }) => ({ id: g.id, name: g.name })
  );

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const estHoursNum = parseFloat(estimatedHours);
  const amountPreview =
    selectedPlan?.hourly_rate && Number.isFinite(estHoursNum) && estHoursNum > 0
      ? Math.round(selectedPlan.hourly_rate * estHoursNum)
      : null;

  function reset() {
    setStep("customer");
    setCustomer(null);
    setQ("");
    setResults([]);
    setQa({ name: "", society_id: "", society: "", apartment_number: "", mobile: "", email: "", source: "direct" });
    setQaError(null);
    setServiceDate(todayStr());
    setServiceTime("10:00");
    setPlanId("");
    setEstimatedHours("1");
    setGardenerId("");
    setSpecialTasks("");
    setCreateError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function runSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/ops/ondemand/customers/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setResults(json.data ?? []);
    } finally {
      setSearching(false);
    }
  }

  function selectCustomer(c: OnDemandCustomer) {
    setCustomer(c);
    setStep("details");
  }

  async function saveQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setQaError(null);
    setQaSaving(true);
    try {
      const res = await fetch("/api/ops/ondemand/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: qa.name,
          society_id: qa.society_id || undefined,
          society: qa.society_id ? undefined : qa.society,
          apartment_number: qa.apartment_number,
          mobile: qa.mobile || undefined,
          email: qa.email || undefined,
          source: qa.source,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setQaError(json.error ?? "Failed to create customer");
        return;
      }
      const societyName = qa.society_id
        ? societies.find((s) => s.id === qa.society_id)?.name ?? null
        : qa.society || null;
      selectCustomer({
        id: json.data.id,
        name: qa.name,
        society: societyName,
        apartment_number: qa.apartment_number,
        mobile: qa.mobile || null,
      });
    } finally {
      setQaSaving(false);
    }
  }

  async function createService() {
    setCreateError(null);
    if (!customer || !planId || !gardenerId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ops/ondemand/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer.id,
          service_date: serviceDate,
          service_time: serviceTime,
          estimated_hours: estHoursNum,
          plan_id: planId,
          assigned_gardener_id: gardenerId,
          special_tasks: specialTasks || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error ?? "Failed to create service");
        return;
      }
      onCreated?.();
      close();
    } finally {
      setCreating(false);
    }
  }

  const canCreate =
    !!customer &&
    !!planId &&
    !!gardenerId &&
    !!serviceDate &&
    !!serviceTime &&
    Number.isFinite(estHoursNum) &&
    estHoursNum > 0;

  return (
    <SlideUpModal open={open} onClose={close} title="New on-demand service">
      {/* Step: customer search */}
      {step === "customer" && (
        <div className="space-y-3">
          <p className="text-xs text-sage">Find an on-demand customer by society, apartment, or name.</p>
          <div className="flex gap-2">
            <input
              className={INPUT_CLS}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Society, apartment, or name"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !q.trim()}
              className="px-3 rounded-xl bg-forest text-offwhite disabled:opacity-40 flex items-center"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer(c)}
                className="w-full text-left rounded-xl border border-stone bg-offwhite px-3 py-2.5 hover:bg-cream"
              >
                <p className="text-sm font-medium text-charcoal">{c.name}</p>
                <p className="text-xs text-sage">
                  {[c.society, c.apartment_number].filter(Boolean).join(" · ") || "—"}
                  {c.last_service_date ? ` · last: ${c.last_service_date}` : ""}
                </p>
              </button>
            ))}
            {q.trim() && !searching && results.length === 0 && (
              <p className="text-xs text-sage text-center py-2">No matches. Quick-add below.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep("quickadd")}
            className="w-full py-2.5 border border-stone rounded-xl text-sm text-forest hover:bg-cream flex items-center justify-center gap-2"
          >
            <UserPlus size={16} /> Quick add customer
          </button>
        </div>
      )}

      {/* Step: quick add */}
      {step === "quickadd" && (
        <form onSubmit={saveQuickAdd} className="space-y-3">
          <button
            type="button"
            onClick={() => setStep("customer")}
            className="text-xs text-sage flex items-center gap-1 hover:text-charcoal"
          >
            <ArrowLeft size={14} /> Back to search
          </button>
          <Field label="Name" required>
            <input className={INPUT_CLS} value={qa.name} onChange={(e) => setQa({ ...qa, name: e.target.value })} required />
          </Field>
          <Field label="Society" required>
            <select
              className={INPUT_CLS}
              value={qa.society_id}
              onChange={(e) => setQa({ ...qa, society_id: e.target.value, society: e.target.value ? "" : qa.society })}
            >
              <option value="">Select or add new…</option>
              {societies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!qa.society_id && (
              <input
                className={`${INPUT_CLS} mt-2`}
                value={qa.society}
                onChange={(e) => setQa({ ...qa, society: e.target.value })}
                placeholder="Or type new society name"
              />
            )}
          </Field>
          <Field label="Apartment" required>
            <input className={INPUT_CLS} value={qa.apartment_number} onChange={(e) => setQa({ ...qa, apartment_number: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile">
              <input className={INPUT_CLS} value={qa.mobile} onChange={(e) => setQa({ ...qa, mobile: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Email">
              <input className={INPUT_CLS} type="email" value={qa.email} onChange={(e) => setQa({ ...qa, email: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Source" required>
            <select className={INPUT_CLS} value={qa.source} onChange={(e) => setQa({ ...qa, source: e.target.value })}>
              {ONDEMAND_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>
              ))}
            </select>
          </Field>
          {qaError && <p className="text-sm text-terra">{qaError}</p>}
          <button
            type="submit"
            disabled={qaSaving || !qa.name || (!qa.society_id && !qa.society.trim()) || !qa.apartment_number}
            className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm hover:bg-garden disabled:opacity-40"
          >
            {qaSaving ? "Adding…" : "Add & continue"}
          </button>
        </form>
      )}

      {/* Step: service details */}
      {step === "details" && customer && (
        <div className="space-y-3">
          <div className="rounded-xl border border-stone bg-cream px-3 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-charcoal">{customer.name}</p>
              <p className="text-xs text-sage">{[customer.society, customer.apartment_number].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <button type="button" onClick={() => setStep("customer")} className="text-xs text-forest hover:underline">
              Change
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <input className={INPUT_CLS} type="date" min={todayStr()} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </Field>
            <Field label="Time" required>
              <input className={INPUT_CLS} type="time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} />
            </Field>
          </div>

          <Field label="Plan" required>
            <select className={INPUT_CLS} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select a plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — ₹{p.hourly_rate}/hr</option>
              ))}
            </select>
            {plans.length === 0 && (
              <p className="text-xs text-terra mt-1">No active on-demand plans. Create one under Plans.</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated hours" required>
              <input className={INPUT_CLS} type="number" min={0.5} step={0.5} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
            </Field>
            <div className="flex flex-col justify-end pb-2">
              <p className="text-xs text-sage">Estimated total</p>
              <p className="text-sm font-medium text-charcoal">
                {amountPreview != null ? `≈ ₹${amountPreview}` : "—"}
              </p>
            </div>
          </div>

          <Field label="Assign gardener" required>
            <select className={INPUT_CLS} value={gardenerId} onChange={(e) => setGardenerId(e.target.value)}>
              <option value="">Select a gardener…</option>
              {gardeners.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Special tasks">
            <textarea
              className={INPUT_CLS}
              rows={2}
              value={specialTasks}
              onChange={(e) => setSpecialTasks(e.target.value)}
              placeholder="Optional notes for the gardener"
            />
          </Field>

          {createError && <p className="text-sm text-terra">{createError}</p>}

          <button
            type="button"
            onClick={createService}
            disabled={!canCreate || creating}
            className="w-full py-3 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Create service
          </button>
        </div>
      )}
    </SlideUpModal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-charcoal mb-1">
        {label} {required && <span className="text-terra">*</span>}
      </label>
      {children}
    </div>
  );
}
