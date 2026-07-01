// NOTE: Keep fields in sync with edit form at src/app/(ops)/ops/customers/[id]/page.tsx (InlineEditForm)
"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, Camera, X, Trash2, Leaf, ShoppingBag } from "lucide-react";
import { compressImage } from "@/lib/utils/compress-image";
import { CUSTOMER_TYPE_LABELS, type CustomerType } from "@/lib/schemas/customer-type";
import PhotoLightbox from "../../../components/PhotoLightbox";

// ─── Types ────────────────────────────────────────────────────────────────────

type Society = { id: string; name: string; address?: string | null };
type Plan = {
  id: string;
  name: string;
  description: string | null;
  visit_frequency: string;
  price: number;
};

type Draft = {
  // Step 0
  customer_type: CustomerType;
  // Step 1
  name: string;
  phone_number: string;
  email: string;
  address: string;
  unit_number: string;
  society_id: string;
  society_name: string; // for new society
  society_short: string; // optional abbreviation for a new society
  // Step 2
  plant_count_range: string;
  light_condition: string;
  watering_responsibility: string[];
  house_help_phone: string;
  // Step 3
  garden_notes: string;
  // Step 4
  plan_id: string;
};

// Stable step IDs — the rendered step LIST is a function of customer_type
// (FD-6). plant_only skips Garden Details + Plan Assignment. Switching type
// only changes which steps render; entered data is preserved (FD-7).
type StepId = "type" | "details" | "garden" | "photos" | "plan" | "review" | "done";

const STEP_LABELS: Record<StepId, string> = {
  type: "Customer Type",
  details: "Customer Details",
  garden: "Garden Details",
  photos: "Photos & Notes",
  plan: "Plan Assignment",
  review: "Review & Confirm",
  done: "Post-Onboarding",
};

const CARE_PLAN_STEPS: StepId[] = ["type", "details", "garden", "photos", "plan", "review", "done"];
const PLANT_ONLY_STEPS: StepId[] = ["type", "details", "photos", "review", "done"];

function stepsForType(type: CustomerType): StepId[] {
  return type === "plant_only" ? PLANT_ONLY_STEPS : CARE_PLAN_STEPS;
}


const PLANT_RANGES = [
  { value: "0_20", label: "0–20 pots" },
  { value: "20_40", label: "20–40 pots" },
  { value: "40_plus", label: "40+ pots" },
];

const WATERING_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "house_help", label: "House help" },
  { value: "others", label: "Others" },
];

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

const selectCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest";

const EMPTY_DRAFT: Draft = {
  customer_type: "care_plan",
  name: "",
  phone_number: "",
  email: "",
  address: "",
  unit_number: "",
  society_id: "",
  society_name: "",
  society_short: "",
  plant_count_range: "",
  light_condition: "",
  watering_responsibility: [],
  house_help_phone: "",
  garden_notes: "",
  plan_id: "",
};

function OnboardingWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");
  // Lead conversion: when present, the first customer-create goes through the
  // atomic /api/ops/leads/[id]/convert endpoint instead of POST /customers.
  const fromLead = searchParams.get("from_lead");

  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(draftId);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // The rendered step list depends on the chosen type. `step` is an index into
  // this list. Type can only change on the first step (index 0), so the index
  // never points past the end of a shrunk list.
  const steps = useMemo(() => stepsForType(draft.customer_type), [draft.customer_type]);
  const stepId = steps[step];
  const isLastStep = step === steps.length - 1;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ id: string; storage_path: string; url?: string | null }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Lookup data
  const [societies, setSocieties] = useState<Society[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  // Load lookups
  useEffect(() => {
    Promise.all([
      fetch("/api/ops/societies").then((r) => r.json()),
      fetch("/api/ops/plans?active=true").then((r) => r.json()),
    ]).then(([socRes, planRes]) => {
      setSocieties(socRes.data ?? []);
      setPlans(planRes.data ?? []);
    });
  }, []);

  // Load existing draft
  useEffect(() => {
    if (!draftId) return;
    fetch(`/api/ops/customers/${draftId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.data) return;
        const c = json.data;
        setDraft((prev) => ({
          ...prev,
          customer_type: c.customer_type === "plant_only" ? "plant_only" : "care_plan",
          name: c.name ?? "",
          phone_number: c.phone_number ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
          unit_number: c.unit_number ?? "",
          society_id: c.society_id ?? "",
          plant_count_range: c.plant_count_range ?? "",
          light_condition: c.light_condition ?? "",
          watering_responsibility: c.watering_responsibility ?? [],
          house_help_phone: c.house_help_phone ?? "",
          garden_notes: c.garden_notes ?? "",
        }));
      });
    // Load existing photos for draft
    fetch(`/api/ops/customers/${draftId}/photos`)
      .then((r) => r.json())
      .then((json) => setPhotos(json.data ?? []))
      .catch(() => {});
  }, [draftId]);

  // Pre-fill from a lead conversion (only on a fresh wizard, no existing draft).
  useEffect(() => {
    if (!fromLead || draftId) return;
    const watering = searchParams.get("watering_responsibility");
    const leadType = searchParams.get("customer_type");
    setDraft((prev) => ({
      ...prev,
      customer_type:
        leadType === "plant_only" || leadType === "care_plan" ? leadType : prev.customer_type,
      name: searchParams.get("name") ?? prev.name,
      phone_number: searchParams.get("phone") ?? prev.phone_number,
      society_id: searchParams.get("society_id") ?? prev.society_id,
      plant_count_range: searchParams.get("plant_count_range") ?? prev.plant_count_range,
      light_condition: searchParams.get("light_condition") ?? prev.light_condition,
      watering_responsibility: watering ? watering.split(",").filter(Boolean) : prev.watering_responsibility,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLead, draftId]);

  const update = useCallback(
    (field: keyof Draft, value: Draft[keyof Draft]) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Save draft (create or update customer)
  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      // Resolve an inline-typed society to an id via the single societies
      // endpoint (dedup + audit + short_name live there), so the pill shows a
      // clean abbreviation immediately.
      let societyId = draft.society_id;
      if (!societyId && draft.society_name.trim()) {
        const socRes = await fetch("/api/ops/societies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.society_name.trim(),
            short_name: draft.society_short.trim() || undefined,
          }),
        });
        const socJson = await socRes.json().catch(() => ({}));
        if (socRes.ok && socJson.data?.id) {
          societyId = socJson.data.id;
          setDraft((prev) => ({ ...prev, society_id: socJson.data.id, society_name: "", society_short: "" }));
        }
      }

      if (customerId) {
        // Update existing draft
        await fetch(`/api/ops/customers/${customerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            phone_number: draft.phone_number,
            email: draft.email || undefined,
            address: draft.address || undefined,
            unit_number: draft.unit_number || undefined,
            society_id: societyId || undefined,
            plant_count_range: draft.plant_count_range || undefined,
            light_condition: draft.light_condition || undefined,
            watering_responsibility:
              draft.watering_responsibility.length > 0
                ? draft.watering_responsibility
                : undefined,
            house_help_phone: draft.house_help_phone || undefined,
            garden_notes: draft.garden_notes || undefined,
          }),
        });
      } else {
        // Create new draft. When converting a lead, route through the atomic
        // convert endpoint so the customer create + lead stamp happen together.
        const customerPayload = {
          customer_type: draft.customer_type,
          name: draft.name,
          phone_number: draft.phone_number,
          email: draft.email || undefined,
          address: draft.address || undefined,
          unit_number: draft.unit_number || undefined,
          society_id: societyId || undefined,
          society_name: draft.society_name || undefined,
          plant_count_range: draft.plant_count_range || undefined,
          light_condition: draft.light_condition || undefined,
          watering_responsibility:
            draft.watering_responsibility.length > 0
              ? draft.watering_responsibility
              : undefined,
          house_help_phone: draft.house_help_phone || undefined,
          garden_notes: draft.garden_notes || undefined,
        };
        const endpoint = fromLead
          ? `/api/ops/leads/${fromLead}/convert`
          : "/api/ops/customers";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customerPayload),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error);
          return false;
        }
        // convert → { data: { customer_id, customer } }; create → { data: { id } }
        const newId = json.data?.customer_id ?? json.data?.id;
        setCustomerId(newId);
      }
      return true;
    } catch {
      setError("Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft.name || !draft.phone_number) {
      setError("Name and phone are required to save a draft");
      return;
    }
    const ok = await saveDraft();
    if (ok) {
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !customerId) return;
    setUploadingPhoto(true);
    for (const file of Array.from(files)) {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("photo", compressed);
      const res = await fetch(`/api/ops/customers/${customerId}/photos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        try {
          const json = await res.json();
          setError(json.error ?? "Photo upload failed");
        } catch {
          setError("Photo upload failed — please try again or use a different image");
        }
        break;
      }
    }
    // Reload photos to get signed URLs
    const photosRes = await fetch(`/api/ops/customers/${customerId}/photos`);
    const photosJson = await photosRes.json();
    setPhotos(photosJson.data ?? []);
    e.target.value = "";
    setUploadingPhoto(false);
  }

  async function handlePhotoDelete(photoId: string) {
    if (!customerId) return;
    const res = await fetch(`/api/ops/customers/${customerId}/photos?photo_id=${photoId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }
  }

  async function handleNext() {
    setError(null);

    // Persist the draft on the data-entry steps once we have enough to create.
    if ((stepId === "details" || stepId === "garden" || stepId === "photos") && draft.name && draft.phone_number) {
      const ok = await saveDraft();
      if (!ok) return;
    }

    // Review → activate the customer. The /activate endpoint branches on the
    // stored customer_type: plant_only just flips to ACTIVE (no plan/slot/care),
    // care_plan runs the full subscription + visit generation path.
    if (stepId === "review") {
      if (!customerId) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/ops/customers/${customerId}/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            draft.customer_type === "plant_only" ? {} : { plan_id: draft.plan_id }
          ),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Activation failed");
          setSaving(false);
          return;
        }
        setActivated(true);
      } catch {
        setError("Activation failed");
      } finally {
        setSaving(false);
      }
    }

    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // Validation per step (keyed by the active step's stable id).
  const canProceed = (() => {
    switch (stepId) {
      case "type":
        return true; // a type is always selected (defaults to care_plan)
      case "details":
        return draft.name.trim() !== "" && draft.phone_number.trim() !== "";
      case "garden":
        return true; // garden details are optional
      case "photos":
        return true; // photos optional
      case "plan":
        return draft.plan_id !== "";
      case "review":
        return true;
      default:
        return false;
    }
  })();

  const selectedPlan = plans.find((p) => p.id === draft.plan_id);
  const selectedSociety =
    societies.find((s) => s.id === draft.society_id)?.name ??
    draft.society_name;

  return (
    <div className="min-h-screen bg-cream pb-40">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() =>
              step === 0 ? router.push("/ops/customers") : handleBack()
            }
            className="text-charcoal hover:text-forest"
          >
            <ArrowLeft size={20} />
          </button>
          <h1
            className="text-xl text-charcoal flex-1"
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            {!isLastStep ? "New Customer" : "Onboarding Complete"}
          </h1>
          <span className="text-xs text-sage">
            {step + 1}/{steps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {steps.map((id, i) => (
            <div
              key={id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-forest" : "bg-stone/40"
              }`}
            />
          ))}
        </div>

        <p className="text-xs text-sage mt-2">{STEP_LABELS[stepId]}</p>
      </div>

      {/* Step content */}
      <div className="px-4 pt-5 max-w-[480px] mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-terra/10 border border-terra/30 rounded-xl text-sm text-terra">
            {error}
          </div>
        )}

        {stepId === "type" && (
          <Step0CustomerType draft={draft} update={update} />
        )}
        {stepId === "details" && (
          <Step1CustomerDetails
            draft={draft}
            update={update}
            societies={societies}
          />
        )}
        {stepId === "garden" && <Step2GardenDetails draft={draft} update={update} />}
        {stepId === "photos" && (
          <Step3ObservationsAndCare
            draft={draft}
            update={update}
            photos={photos}
            uploadingPhoto={uploadingPhoto}
            onPhotoUpload={handlePhotoUpload}
            onPhotoDelete={handlePhotoDelete}
            customerId={customerId}
            photoInputRef={photoInputRef}
          />
        )}
        {stepId === "plan" && (
          <Step4PlanAssignment draft={draft} update={update} plans={plans} />
        )}
        {stepId === "review" && (
          <Step6Review
            draft={draft}
            selectedPlan={selectedPlan}
            selectedSociety={selectedSociety}
          />
        )}
        {stepId === "done" && (
          <Step7PostOnboarding
            draft={draft}
            selectedPlan={selectedPlan}
            customerId={customerId}
          />
        )}
      </div>

      {/* Bottom nav */}
      {!isLastStep && (
        <div className="fixed left-0 right-0 bg-offwhite border-t border-stone px-4 py-3 z-20" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="max-w-[480px] mx-auto space-y-2">
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed || saving}
                className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  "Saving…"
                ) : stepId === "review" ? (
                  <>
                    <Check size={16} /> Confirm & Activate
                  </>
                ) : (
                  <>
                    Next <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
            {stepId !== "done" && (
              <button
                onClick={handleSaveDraft}
                disabled={saving || !draft.name || !draft.phone_number}
                className="w-full py-2 text-xs text-sage hover:text-forest disabled:opacity-30 transition-colors"
              >
                {draftSaved ? "Draft saved ✓" : "Save as draft & exit later"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Done button on last step */}
      {isLastStep && (
        <div className="fixed left-0 right-0 bg-offwhite border-t border-stone px-4 py-3 z-20" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="max-w-[480px] mx-auto">
            <button
              onClick={() => router.push("/ops/customers")}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
            >
              Done — Go to Customers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function OnboardingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream flex items-center justify-center">
          <p className="text-sm text-sage">Loading…</p>
        </div>
      }
    >
      <OnboardingWizardInner />
    </Suspense>
  );
}

// ─── Step Components ──────────────────────────────────────────────────────────

function Step0CustomerType({
  draft,
  update,
}: {
  draft: Draft;
  update: (k: keyof Draft, v: Draft[keyof Draft]) => void;
}) {
  const options: {
    value: CustomerType;
    icon: typeof Leaf;
    blurb: string;
  }[] = [
    {
      value: "care_plan",
      icon: Leaf,
      blurb: "Recurring care subscriber — scheduled visits, care schedules, and billing. Can also order plants.",
    },
    {
      value: "plant_only",
      icon: ShoppingBag,
      blurb: "Transactional plant buyer — no subscription, visits, or care schedules. Lighter onboarding.",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-sage mb-1">What kind of customer is this?</p>
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = draft.customer_type === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => update("customer_type", opt.value)}
            className={`w-full text-left p-4 rounded-2xl border transition-colors flex gap-3 ${
              selected
                ? "border-forest bg-[#EAF2EC]"
                : "border-stone/60 bg-offwhite hover:border-forest/40"
            }`}
          >
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected ? "bg-forest text-offwhite" : "bg-cream text-sage"
              }`}
            >
              <Icon size={20} />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-charcoal">
                {CUSTOMER_TYPE_LABELS[opt.value]}
              </span>
              <span className="block text-xs text-sage mt-0.5 leading-relaxed">
                {opt.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Step1CustomerDetails({
  draft,
  update,
  societies,
}: {
  draft: Draft;
  update: (k: keyof Draft, v: Draft[keyof Draft]) => void;
  societies: Society[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Name <span className="text-terra">*</span>
        </label>
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Customer name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Phone <span className="text-terra">*</span>
        </label>
        <input
          className={inputCls}
          type="tel"
          value={draft.phone_number}
          onChange={(e) => update("phone_number", e.target.value)}
          placeholder="+91 98765 43210"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Email <span className="text-sage text-xs">(optional)</span>
        </label>
        <input
          className={inputCls}
          type="email"
          value={draft.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="customer@example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Society
        </label>
        <select
          className={selectCls}
          value={draft.society_id}
          onChange={(e) => {
            const id = e.target.value;
            update("society_id", id);
            if (id) {
              update("society_name", "");
              update("society_short", "");
              // Auto-populate the address from the society so the operator only
              // has to enter the flat number.
              const soc = societies.find((s) => s.id === id);
              if (soc?.address) update("address", soc.address);
            }
          }}
        >
          <option value="">Select or add new…</option>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!draft.society_id && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className={inputCls}
              value={draft.society_name}
              onChange={(e) => update("society_name", e.target.value)}
              placeholder="Or type new society name"
            />
            <input
              className={inputCls}
              value={draft.society_short}
              onChange={(e) => update("society_short", e.target.value)}
              placeholder="Short name (e.g. WoYM)"
            />
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Address
        </label>
        <input
          className={inputCls}
          value={draft.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Building name, Area"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Unit / Flat no.
        </label>
        <input
          className={inputCls}
          value={draft.unit_number}
          onChange={(e) => update("unit_number", e.target.value)}
          placeholder="e.g. A-604, Villa 12"
        />
      </div>
    </div>
  );
}

function Step2GardenDetails({
  draft,
  update,
}: {
  draft: Draft;
  update: (k: keyof Draft, v: Draft[keyof Draft]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Plant count range
        </label>
        <div className="flex gap-2">
          {PLANT_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => update("plant_count_range", r.value)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                draft.plant_count_range === r.value
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone hover:border-forest"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Light condition
        </label>
        <input
          className={inputCls}
          value={draft.light_condition}
          onChange={(e) => update("light_condition", e.target.value)}
          placeholder="e.g. North-facing, partial shade"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">
          Watering responsibility
        </label>
        <div className="flex gap-2 flex-wrap">
          {WATERING_OPTIONS.map((w) => {
            const selected = draft.watering_responsibility.includes(w.value);
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => {
                  const next = selected
                    ? draft.watering_responsibility.filter(
                        (v) => v !== w.value
                      )
                    : [...draft.watering_responsibility, w.value];
                  update("watering_responsibility", next);
                }}
                className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                  selected
                    ? "bg-forest text-offwhite border-forest"
                    : "bg-cream text-charcoal border-stone"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </div>

      {draft.watering_responsibility.includes("house_help") && (
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">
            House help phone
          </label>
          <input
            className={inputCls}
            type="tel"
            value={draft.house_help_phone}
            onChange={(e) => update("house_help_phone", e.target.value)}
            placeholder="+91…"
          />
        </div>
      )}

    </div>
  );
}

function Step3ObservationsAndCare({
  draft,
  update,
  photos,
  uploadingPhoto,
  onPhotoUpload,
  onPhotoDelete,
  customerId,
  photoInputRef,
}: {
  draft: Draft;
  update: (k: keyof Draft, v: Draft[keyof Draft]) => void;
  photos: { id: string; storage_path: string; url?: string | null }[];
  uploadingPhoto: boolean;
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoDelete: (photoId: string) => void;
  customerId: string | null;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxPhotos = photos.filter((p) => p.url).map((p) => ({ url: p.url! }));

  return (
    <div className="space-y-5">
      {/* Photos */}
      <div>
        <p className="text-sm font-medium text-charcoal mb-1">
          Garden photos <span className="text-sage text-[10px] font-normal">(optional but recommended)</span>
        </p>
        <p className="text-xs text-sage mb-3">
          Upload up to 3 photos of the customer&apos;s garden. You can add them later from the customer page.
        </p>

        {!customerId && (
          <p className="text-xs text-terra mb-2">
            Save the draft first (tap Next once) before uploading photos.
          </p>
        )}

        {customerId && (
          <>
            <p className="text-sm text-charcoal mb-2">
              {photos.length}/3 photo{photos.length !== 1 ? "s" : ""} uploaded
            </p>

            {photos.length > 0 && (
              <div className="flex gap-3 overflow-x-auto mb-3">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative flex-shrink-0">
                    <div
                      className="w-20 h-20 bg-cream rounded-xl border border-stone/40 overflow-hidden cursor-pointer hover:border-forest/60 transition-colors"
                      onClick={() => p.url && setLightboxIndex(i)}
                    >
                      {p.url ? (
                        <img src={p.url} alt="Garden photo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-sage text-center px-1 break-all flex items-center justify-center w-full h-full">{p.storage_path.split("/").pop()}</span>
                      )}
                    </div>
                    <button
                      onClick={() => onPhotoDelete(p.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-terra text-offwhite rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      title="Delete photo"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {lightboxIndex !== null && lightboxPhotos.length > 0 && (
              <PhotoLightbox
                photos={lightboxPhotos}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}

            {photos.length < 3 && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPhotoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="w-full py-3 border-2 border-dashed border-stone rounded-xl text-sm text-sage hover:border-forest hover:text-forest flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Camera size={16} />
                  {uploadingPhoto ? "Uploading…" : "Add Photos"}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">
          Notes
        </label>
        <textarea
          className={`${inputCls} min-h-[100px]`}
          value={draft.garden_notes}
          onChange={(e) => update("garden_notes", e.target.value)}
          placeholder="Any observations or notes about the garden…"
        />
      </div>

    </div>
  );
}

function Step4PlanAssignment({
  draft,
  update,
  plans,
}: {
  draft: Draft;
  update: (k: keyof Draft, v: Draft[keyof Draft]) => void;
  plans: Plan[];
}) {
  const FREQ_LABEL: Record<string, string> = {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    monthly: "Monthly",
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-sage mb-1">
        Select a plan for this customer:
      </p>
      {plans.map((plan) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => update("plan_id", plan.id)}
          className={`w-full text-left p-4 rounded-2xl border transition-colors ${
            draft.plan_id === plan.id
              ? "border-forest bg-[#EAF2EC]"
              : "border-stone/60 bg-offwhite hover:border-forest/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-charcoal">{plan.name}</p>
            <p className="text-sm font-medium text-forest">
              ₹{plan.price}/mo
            </p>
          </div>
          {plan.description && (
            <p className="text-xs text-sage mt-1">{plan.description}</p>
          )}
          <p className="text-xs text-sage mt-1">
            Visits: {FREQ_LABEL[plan.visit_frequency] ?? plan.visit_frequency}
          </p>
        </button>
      ))}
      {plans.length === 0 && (
        <p className="text-sm text-stone text-center py-4">
          No active plans. Create one in Plans first.
        </p>
      )}
    </div>
  );
}



function Step6Review({
  draft,
  selectedPlan,
  selectedSociety,
}: {
  draft: Draft;
  selectedPlan?: Plan;
  selectedSociety?: string;
}) {
  const isPlantOnly = draft.customer_type === "plant_only";

  const sections = [
    {
      title: "Customer",
      items: [
        ["Type", CUSTOMER_TYPE_LABELS[draft.customer_type]],
        ["Name", draft.name],
        ["Phone", draft.phone_number],
        ["Email", draft.email || "—"],
        ["Address", draft.address || "—"],
        ["Society", selectedSociety || "—"],
      ],
    },
    // Garden + Plan are care-plan-only concepts — hidden for plant_only (FD-10).
    ...(isPlantOnly
      ? []
      : [
          {
            title: "Garden",
            items: [
              [
                "Plants",
                PLANT_RANGES.find((r) => r.value === draft.plant_count_range)?.label ??
                  "—",
              ],
              ["Light", draft.light_condition || "—"],
              [
                "Watering",
                draft.watering_responsibility
                  .map(
                    (w) => WATERING_OPTIONS.find((o) => o.value === w)?.label ?? w
                  )
                  .join(", ") || "—",
              ],
            ],
          },
          {
            title: "Plan",
            items: [
              ["Plan", selectedPlan?.name ?? "—"],
              ["Price", selectedPlan ? `₹${selectedPlan.price}/mo` : "—"],
            ],
          },
        ]),
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-sage">
        {isPlantOnly
          ? "Review the details below, then tap “Confirm & Activate” to activate this plant-order customer."
          : "Review the details below, then tap “Confirm & Activate” to activate this customer and generate their visit schedule."}
      </p>
      {sections.map((sec) => (
        <div
          key={sec.title}
          className="bg-offwhite rounded-2xl border border-stone/60 p-4"
        >
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">
            {sec.title}
          </p>
          <div className="space-y-1">
            {sec.items.map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-sage">{label}</span>
                <span className="text-charcoal font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}

function Step7PostOnboarding({
  draft,
  selectedPlan,
  customerId,
}: {
  draft: Draft;
  selectedPlan?: Plan;
  customerId: string | null;
}) {
  const isPlantOnly = draft.customer_type === "plant_only";
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(
    isPlantOnly
      ? `Hi ${draft.name}! 🌿\n\nWelcome to Nuvvy! Thanks for choosing us for your plants.\n\nWe'll be in touch about your plant order and keep you posted on availability and delivery.\n\nIf you have any questions, just reply here. 🌱\n\n— Team Nuvvy`
      : `Hi ${draft.name}! 🌿\n\nWelcome to Nuvvy! We're excited to start taking care of your garden.\n\nHere's a summary of your plan:\n• Plan: ${selectedPlan?.name ?? "—"} (₹${selectedPlan?.price ?? "—"}/month)\n\nWe'll be setting up your visit schedule shortly and will share the details with you.\n\nIf you have any questions, just reply here. 🌱\n\n— Team Nuvvy`
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#EAF2EC] rounded-2xl p-4 text-center">
        <div className="w-12 h-12 bg-forest rounded-full flex items-center justify-center mx-auto mb-3">
          <Check size={24} className="text-offwhite" />
        </div>
        <p className="font-medium text-charcoal">Customer activated!</p>
        <p className="text-sm text-sage mt-1">
          {isPlantOnly
            ? "This is a plant-order customer — no recurring visits or care schedules."
            : "Visits have been auto-generated for the next 6 weeks."}
        </p>
      </div>

      {/* plant_only: jump straight to creating a plant order */}
      {isPlantOnly && customerId && (
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-sm font-medium text-charcoal mb-1">Next step</p>
          <p className="text-xs text-sage mb-3">
            Create the customer&apos;s first plant order.
          </p>
          <a
            href={`/ops/customers/${customerId}?tab=plant_orders`}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-xs font-medium hover:bg-garden"
          >
            <ShoppingBag size={14} /> Create plant order →
          </a>
        </div>
      )}

      {/* care_plan: next-steps reminder (slot + care schedules) */}
      {!isPlantOnly && customerId && (
        <div className="bg-terra/10 rounded-2xl border border-terra/30 p-4">
          <p className="text-sm font-medium text-charcoal mb-2">Next steps</p>
          <ul className="text-xs text-sage space-y-1 mb-3">
            <li>• <strong className="text-charcoal">Assign primary slot</strong> — set visit day, time, and gardener</li>
            <li>• <strong className="text-charcoal">Set up care schedules</strong> — fertilizer, pesticide, and other care cycles</li>
          </ul>
          <a
            href={`/ops/customers/${customerId}?edit=true`}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-forest text-offwhite rounded-xl text-xs font-medium hover:bg-garden"
          >
            Open Customer Profile →
          </a>
        </div>
      )}

      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">
            Welcome Message
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-forest hover:text-garden font-medium"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy for WhatsApp"}
          </button>
        </div>
        <textarea
          className="w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest min-h-[200px] leading-relaxed"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {customerId && (
        <a
          href={`/ops/customers/${customerId}`}
          className="block text-center text-sm text-forest hover:text-garden font-medium"
        >
          View customer profile →
        </a>
      )}
    </div>
  );
}
