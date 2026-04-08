"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  description: string | null;
  visit_frequency: "weekly" | "fortnightly" | "monthly";
  visit_duration_minutes: number;
  price: number;
  billing_cycle: "monthly" | "quarterly";
  includes_fertilizer: boolean;
  includes_pest_control: boolean;
  is_active: boolean;
  created_at: string;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<Plan["visit_frequency"], string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

const selectCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest";

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        active ? "bg-[#EAF2EC] text-forest" : "bg-stone/30 text-sage"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function PlanFormModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = plan !== null;

  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [visitFrequency, setVisitFrequency] = useState<Plan["visit_frequency"]>(
    plan?.visit_frequency ?? "fortnightly"
  );
  const [visitDuration, setVisitDuration] = useState(
    String(plan?.visit_duration_minutes ?? 60)
  );
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [billingCycle, setBillingCycle] = useState<Plan["billing_cycle"]>(
    plan?.billing_cycle ?? "monthly"
  );
  const [includesFertilizer, setIncludesFertilizer] = useState(
    plan?.includes_fertilizer ?? true
  );
  const [includesPestControl, setIncludesPestControl] = useState(
    plan?.includes_pest_control ?? true
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      name,
      description: description || undefined,
      visit_frequency: visitFrequency,
      visit_duration_minutes: parseInt(visitDuration) || 60,
      price: parseFloat(price),
      billing_cycle: billingCycle,
      includes_fertilizer: includesFertilizer,
      includes_pest_control: includesPestControl,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/ops/plans/${plan.id}` : "/api/ops/plans",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6 max-h-[80vh] overflow-y-auto">
        <h2
          className="text-lg text-charcoal mb-4"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          {isEdit ? "Edit plan" : "New plan"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Name <span className="text-terra">*</span>
            </label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Starter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Description
            </label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="0–20 pots · fortnightly visits"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Visit frequency <span className="text-terra">*</span>
              </label>
              <select
                className={selectCls}
                value={visitFrequency}
                onChange={(e) =>
                  setVisitFrequency(e.target.value as Plan["visit_frequency"])
                }
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Duration (min)
              </label>
              <input
                className={inputCls}
                type="number"
                min={15}
                value={visitDuration}
                onChange={(e) => setVisitDuration(e.target.value)}
                placeholder="60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Price (₹/mo) <span className="text-terra">*</span>
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                placeholder="799"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Billing cycle
              </label>
              <select
                className={selectCls}
                value={billingCycle}
                onChange={(e) =>
                  setBillingCycle(e.target.value as Plan["billing_cycle"])
                }
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
              <input
                type="checkbox"
                checked={includesFertilizer}
                onChange={(e) => setIncludesFertilizer(e.target.checked)}
                className="accent-forest w-4 h-4"
              />
              Fertilizer
            </label>
            <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
              <input
                type="checkbox"
                checked={includesPestControl}
                onChange={(e) => setIncludesPestControl(e.target.checked)}
                className="accent-forest w-4 h-4"
              />
              Pest control
            </label>
          </div>

          {error && <p className="text-sm text-terra">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name || !price}
              className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm hover:bg-garden disabled:opacity-40"
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deactivate / Activate confirm ────────────────────────────────────────────

function ToggleActiveConfirm({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: Plan;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDeactivating = plan.is_active;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-charcoal mb-2">
          {isDeactivating ? "Deactivate" : "Reactivate"} &ldquo;{plan.name}&rdquo;?
        </h2>
        <p className="text-sm text-sage mb-6">
          {isDeactivating
            ? "This plan will no longer be available for new customer assignments."
            : "This plan will become available for customer assignments again."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm text-offwhite ${
              isDeactivating
                ? "bg-terra hover:opacity-90"
                : "bg-forest hover:bg-garden"
            }`}
          >
            {isDeactivating ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isAdmin,
  onEdit,
  onToggle,
}: {
  plan: Plan;
  isAdmin: boolean;
  onEdit: (p: Plan) => void;
  onToggle: (p: Plan) => void;
}) {
  return (
    <div
      className={`bg-offwhite rounded-2xl border px-4 py-3 space-y-2 ${
        plan.is_active ? "border-stone/60" : "border-stone/40 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-charcoal">{plan.name}</p>
          {plan.description && (
            <p className="text-xs text-sage mt-0.5">{plan.description}</p>
          )}
        </div>
        <StatusBadge active={plan.is_active} />
      </div>

      {/* Details row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal">
        <span>
          <span className="text-sage">Visits:</span>{" "}
          {FREQ_LABEL[plan.visit_frequency]}
        </span>
        <span>
          <span className="text-sage">Duration:</span> {plan.visit_duration_minutes}min
        </span>
        <span>
          <span className="text-sage">Price:</span> ₹{plan.price}/mo
        </span>
        <span>
          <span className="text-sage">Billing:</span>{" "}
          {plan.billing_cycle === "monthly" ? "Monthly" : "Quarterly"}
        </span>
      </div>

      {/* Inclusions */}
      <div className="flex gap-3 text-xs text-sage">
        {plan.includes_fertilizer && <span>+ Fertilizer</span>}
        {plan.includes_pest_control && <span>+ Pest control</span>}
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="flex items-center gap-4 pt-1 border-t border-stone/40">
          <button
            onClick={() => onEdit(plan)}
            className="flex items-center gap-1.5 text-xs text-forest hover:text-garden font-medium"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => onToggle(plan)}
            className={`flex items-center gap-1.5 text-xs font-medium ml-auto ${
              plan.is_active
                ? "text-terra hover:opacity-80"
                : "text-forest hover:opacity-80"
            }`}
          >
            {plan.is_active ? (
              <>
                <ToggleLeft size={14} /> Deactivate
              </>
            ) : (
              <>
                <ToggleRight size={14} /> Reactivate
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Modal state
  const [formTarget, setFormTarget] = useState<Plan | null | undefined>(
    undefined
  ); // undefined = closed, null = create, Plan = edit
  const [toggleTarget, setToggleTarget] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = showInactive ? "" : "?active=true";
    const res = await fetch(`/api/ops/plans${params}`);
    const json = await res.json();
    setPlans(json.data ?? []);
    setLoading(false);
  }, [showInactive]);

  // Check own role
  useEffect(() => {
    fetch("/api/ops/people/me/role")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.data?.role === "admin"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleActive(plan: Plan) {
    await fetch(`/api/ops/plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !plan.is_active }),
    });
    setToggleTarget(null);
    load();
  }

  const activePlans = plans.filter((p) => p.is_active);
  const inactivePlans = plans.filter((p) => !p.is_active);

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            Plans
          </h1>
          {isAdmin && (
            <button
              onClick={() => setFormTarget(null)}
              className="flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>

        {/* Show inactive toggle */}
        <label className="flex items-center gap-2 text-xs text-sage cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-forest w-3.5 h-3.5"
          />
          Show inactive plans
        </label>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading…</p>
        ) : (
          <>
            <Section title="Active plans" count={activePlans.length}>
              {activePlans.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  isAdmin={isAdmin}
                  onEdit={(plan) => setFormTarget(plan)}
                  onToggle={setToggleTarget}
                />
              ))}
            </Section>

            {showInactive && inactivePlans.length > 0 && (
              <Section title="Inactive plans" count={inactivePlans.length}>
                {inactivePlans.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    isAdmin={isAdmin}
                    onEdit={(plan) => setFormTarget(plan)}
                    onToggle={setToggleTarget}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {formTarget !== undefined && (
        <PlanFormModal
          plan={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={load}
        />
      )}
      {toggleTarget && (
        <ToggleActiveConfirm
          plan={toggleTarget}
          onConfirm={() => handleToggleActive(toggleTarget)}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">
        {title} <span className="normal-case">({count})</span>
      </p>
      <div className="space-y-2">
        {count === 0 ? (
          <p className="text-sm text-stone text-center py-4">
            No plans yet. Create one to get started.
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
