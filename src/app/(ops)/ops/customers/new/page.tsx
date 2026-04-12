// NOTE: Keep fields in sync with edit form at src/app/(ops)/ops/customers/[id]/page.tsx (InlineEditForm)
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, Camera, X, Trash2 } from "lucide-react";
import { compressImage } from "@/lib/utils/compress-image";
import PhotoLightbox from "../../../components/PhotoLightbox";

// ─── Types ────────────────────────────────────────────────────────────────────

type Society = { id: string; name: string };
type Plan = {
  id: string;
  name: string;
  description: string | null;
  visit_frequency: string;
  price: number;
};

type Draft = {
  // Step 1
  name: string;
  phone_number: string;
  email: string;
  address: string;
  society_id: string;
  society_name: string; // for new society
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

const STEPS = [
  "Customer Details",
  "Garden Details",
  "Photos & Notes",
  "Plan Assignment",
  "Review & Confirm",
  "Post-Onboarding",
];


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
  name: "",
  phone_number: "",
  email: "",
  address: "",
  society_id: "",
  society_name: "",
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

  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(draftId);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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
          name: c.name ?? "",
          phone_number: c.phone_number ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
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
            society_id: draft.society_id || undefined,
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
        // Create new draft
        const res = await fetch("/api/ops/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            phone_number: draft.phone_number,
            email: draft.email || undefined,
            address: draft.address || undefined,
            society_id: draft.society_id || undefined,
            society_name: draft.society_name || undefined,
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
        const json = await res.json();
        if (!res.ok) {
          setError(json.error);
          return false;
        }
        setCustomerId(json.data.id);
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

    // Save draft at step transitions where we have enough data
    if (step <= 2 && draft.name && draft.phone_number) {
      const ok = await saveDraft();
      if (!ok) return;
    }

    // Step 4 → 5: Activate the customer
    if (step === 4) {
      if (!customerId) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/ops/customers/${customerId}/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_id: draft.plan_id,
          }),
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

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // Validation per step
  const canProceed = (() => {
    switch (step) {
      case 0:
        return draft.name.trim() !== "" && draft.phone_number.trim() !== "";
      case 1:
        return true; // garden details are optional
      case 2:
        return photos.length >= 1; // at least 1 onboarding photo required
      case 3:
        return draft.plan_id !== "";
      case 4:
        return true; // review step
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
            {step < STEPS.length - 1 ? "New Customer" : "Onboarding Complete"}
          </h1>
          <span className="text-xs text-sage">
            {step + 1}/{STEPS.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-forest" : "bg-stone/40"
              }`}
            />
          ))}
        </div>

        <p className="text-xs text-sage mt-2">{STEPS[step]}</p>
      </div>

      {/* Step content */}
      <div className="px-4 pt-5 max-w-[480px] mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-terra/10 border border-terra/30 rounded-xl text-sm text-terra">
            {error}
          </div>
        )}

        {step === 0 && (
          <Step1CustomerDetails
            draft={draft}
            update={update}
            societies={societies}
          />
        )}
        {step === 1 && <Step2GardenDetails draft={draft} update={update} />}
        {step === 2 && (
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
        {step === 3 && (
          <Step4PlanAssignment draft={draft} update={update} plans={plans} />
        )}
        {step === 4 && (
          <Step6Review
            draft={draft}
            selectedPlan={selectedPlan}
            selectedSociety={selectedSociety}
          />
        )}
        {step === 5 && (
          <Step7PostOnboarding
            draft={draft}
            selectedPlan={selectedPlan}
            customerId={customerId}
          />
        )}
      </div>

      {/* Bottom nav */}
      {step < STEPS.length - 1 && (
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
                ) : step === 4 ? (
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
            {step < 5 && (
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
      {step === STEPS.length - 1 && (
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
          Address
        </label>
        <input
          className={inputCls}
          value={draft.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Flat/Tower, Building name, Area"
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
            update("society_id", e.target.value);
            if (e.target.value) update("society_name", "");
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
          <input
            className={`${inputCls} mt-2`}
            value={draft.society_name}
            onChange={(e) => update("society_name", e.target.value)}
            placeholder="Or type new society name"
          />
        )}
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
          Garden photos <span className="text-terra">*</span>
        </p>
        <p className="text-xs text-sage mb-3">
          Upload 1–3 photos of the customer&apos;s garden. At least 1 is required.
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
              {photos.length === 0 && (
                <span className="text-terra ml-1">(min 1 required)</span>
              )}
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
  const sections = [
    {
      title: "Customer",
      items: [
        ["Name", draft.name],
        ["Phone", draft.phone_number],
        ["Email", draft.email || "—"],
        ["Address", draft.address || "—"],
        ["Society", selectedSociety || "—"],
      ],
    },
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
              (w) =>
                WATERING_OPTIONS.find((o) => o.value === w)?.label ?? w
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
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-sage">
        Review the details below, then tap &quot;Confirm &amp; Activate&quot; to
        activate this customer and generate their visit schedule.
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
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(
    `Hi ${draft.name}! 🌿\n\nWelcome to Nuvvy! We're excited to start taking care of your garden.\n\nHere's a summary of your plan:\n• Plan: ${selectedPlan?.name ?? "—"} (₹${selectedPlan?.price ?? "—"}/month)\n\nWe'll be setting up your visit schedule shortly and will share the details with you.\n\nIf you have any questions, just reply here. 🌱\n\n— Team Nuvvy`
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
          Visits have been auto-generated for the next 6 weeks.
        </p>
      </div>

      {/* Next steps reminder */}
      {customerId && (
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
