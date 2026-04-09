"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Calendar,
  Leaf,
  AlertCircle,
  UserX,
  UserCheck,
  Pencil,
  Camera,
  Trash2,
} from "lucide-react";
import { compressImage } from "@/lib/utils/compress-image";
import PhotoLightbox from "../../../components/PhotoLightbox";

type CustomerDetail = {
  id: string;
  name: string;
  phone_number: string | null;
  email: string | null;
  address: string | null;
  status: string;
  plant_count_range: string | null;
  light_condition: string | null;
  watering_responsibility: string[] | null;
  house_help_phone: string | null;
  garden_notes: string | null;
  deactivation_reason: string | null;
  created_at: string;
  society: { id: string; name: string } | null;
  observations: { id: string; text: string; updated_at: string }[];
  subscription: {
    id: string;
    status: string;
    plan: { id: string; name: string; visit_frequency: string; price: number } | null;
  } | null;
  care_schedules: {
    id: string;
    care_action_type_id: string;
    care_action_name: string | null;
    cycle_anchor_date: string;
    next_due_date: string | null;
    last_done_date: string | null;
  }[];
};

type Service = {
  id: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
};

type CustRequest = {
  id: string;
  type: string;
  description: string | null;
  status: string;
  created_at: string;
};

type CustBill = {
  id: string;
  amount_inr: number;
  due_date: string;
  status: string;
  billing_period_start: string;
  billing_period_end: string;
  paid_at: string | null;
  is_overdue: boolean;
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  DRAFT: { cls: "bg-stone/30 text-charcoal", label: "Draft" },
  ACTIVE: { cls: "bg-[#EAF2EC] text-forest", label: "Active" },
  INACTIVE: { cls: "bg-stone/30 text-sage", label: "Inactive" },
};

const SERVICE_STATUS_CLS: Record<string, string> = {
  scheduled: "bg-cream text-charcoal",
  in_progress: "bg-forest/10 text-forest",
  completed: "bg-[#EAF2EC] text-forest",
  not_completed: "bg-terra/10 text-terra",
  missed: "bg-terra/10 text-terra",
  cancelled: "bg-stone/30 text-sage",
};

const CARE_LABELS: Record<string, string> = {
  fertilizer: "Fertilizer",
  vermi_compost: "Vermi Compost",
  micro_nutrients: "Micro Nutrients",
  neem_oil: "Neem Oil",
};

const PLANT_LABEL: Record<string, string> = {
  "0_20": "0–20 pots",
  "20_40": "20–40 pots",
  "40_plus": "40+ pots",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Skeleton Components ──────────────────────────────────────────────────────

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-5 animate-pulse">
      <div className="h-3 w-24 bg-stone/30 rounded mb-4" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3.5 w-20 bg-stone/20 rounded" />
            <div className="h-3.5 w-32 bg-stone/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonHeader() {
  return (
    <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 animate-pulse">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-5 h-5 bg-stone/20 rounded" />
        <div className="flex-1">
          <div className="h-6 w-40 bg-stone/30 rounded" />
        </div>
        <div className="h-8 w-20 bg-stone/20 rounded-xl" />
      </div>
      <div className="flex gap-3 mb-3">
        <div className="h-3 w-28 bg-stone/20 rounded" />
        <div className="h-3 w-24 bg-stone/20 rounded" />
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-20 bg-stone/20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export default function Customer360Page() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"overview" | "services" | "requests" | "billing">("overview");
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(searchParams.get("edit") === "true");

  // Sync edit state when URL search params change (e.g. navigating from customer list Edit button)
  useEffect(() => {
    setShowEdit(searchParams.get("edit") === "true");
  }, [searchParams]);

  // SWR fetches
  const { data: custData, isLoading: custLoading, mutate: mutateCust } = useSWR(
    `/api/ops/customers/${customerId}`,
    fetcher
  );
  const { data: svcData, isLoading: svcLoading, mutate: mutateSvc } = useSWR(
    `/api/ops/schedule/services?customer_id=${customerId}`,
    fetcher
  );
  const { data: reqData, isLoading: reqLoading, mutate: mutateReq } = useSWR(
    `/api/ops/requests?customer_id=${customerId}`,
    fetcher
  );
  const { data: billData, isLoading: billLoading, mutate: mutateBill } = useSWR(
    `/api/ops/billing?customer_id=${customerId}`,
    fetcher
  );
  const { data: roleData } = useSWR("/api/ops/people/me/role", fetcher);
  const { data: societiesData } = useSWR("/api/ops/societies", fetcher);

  const customer: CustomerDetail | null = custData?.data ?? null;
  const services: Service[] = svcData?.data ?? [];
  const requests: CustRequest[] = reqData?.data ?? [];
  const bills: CustBill[] = billData?.data ?? [];
  const isAdmin = roleData?.data?.role === "admin";
  const societies: { id: string; name: string }[] = societiesData?.data ?? [];

  const loading = custLoading || svcLoading || reqLoading || billLoading;

  function revalidateAll() {
    mutateCust();
    mutateSvc();
    mutateReq();
    mutateBill();
  }

  async function handleDeactivate() {
    if (!deactivateReason.trim()) return;
    setActionLoading(true);
    await fetch(`/api/ops/customers/${customerId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: deactivateReason }),
    });
    setShowDeactivate(false);
    setDeactivateReason("");
    setActionLoading(false);
    revalidateAll();
  }

  async function handleReactivate() {
    setActionLoading(true);
    await fetch(`/api/ops/customers/${customerId}/reactivate`, {
      method: "POST",
    });
    setActionLoading(false);
    revalidateAll();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <SkeletonHeader />
        <div className="px-4 pt-4 space-y-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-terra">Customer not found</p>
      </div>
    );
  }

  const badge = STATUS_BADGE[customer.status] ?? {
    cls: "bg-stone/30 text-charcoal",
    label: customer.status,
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.push("/ops/customers")}
            className="text-charcoal hover:text-forest"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className="text-xl text-charcoal truncate"
                style={{
                  fontFamily: "var(--font-cormorant, serif)",
                  fontWeight: 500,
                }}
              >
                {customer.name}
              </h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>
          </div>
          <button
            onClick={() => { setShowEdit(!showEdit); setTab("overview"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs transition-colors flex-shrink-0 ${
              showEdit
                ? "border-forest bg-forest text-offwhite"
                : "border-stone text-charcoal hover:border-forest hover:text-forest"
            }`}
          >
            <Pencil size={14} /> {showEdit ? "Editing" : "Edit"}
          </button>
        </div>

        {/* Contact info */}
        <div className="flex flex-wrap gap-3 text-xs text-sage mb-3">
          {customer.phone_number && (
            <span className="flex items-center gap-1">
              <Phone size={12} /> {customer.phone_number}
            </span>
          )}
          {customer.society?.name && (
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {customer.society.name}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(["overview", "services", "requests", "billing"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                tab === t
                  ? "bg-forest text-offwhite border-forest"
                  : "bg-cream text-charcoal border-stone"
              }`}
            >
              {t === "overview" ? "Overview" : t === "services" ? "Services" : t === "requests" ? "Requests" : "Billing"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {tab === "overview" && !showEdit && (
          <OverviewTab customer={customer} customerId={customerId} />
        )}
        {tab === "overview" && showEdit && customer && (
          <InlineEditForm
            customer={customer}
            customerId={customerId}
            societies={societies}
            onClose={() => setShowEdit(false)}
            onSaved={() => { setShowEdit(false); revalidateAll(); }}
          />
        )}
        {tab === "services" && (
          <ServicesTab services={services} />
        )}
        {tab === "requests" && (
          <RequestsTab requests={requests} />
        )}
        {tab === "billing" && (
          <BillingTab bills={bills} />
        )}

        {/* Admin actions */}
        {isAdmin && customer.status === "ACTIVE" && (
          <button
            onClick={() => setShowDeactivate(true)}
            className="w-full py-2.5 border border-terra/40 rounded-xl text-sm text-terra hover:bg-terra/5 flex items-center justify-center gap-1.5"
          >
            <UserX size={14} /> Deactivate Customer
          </button>
        )}
        {isAdmin && customer.status === "INACTIVE" && (
          <button
            onClick={handleReactivate}
            disabled={actionLoading}
            className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <UserCheck size={14} /> Reactivate Customer
          </button>
        )}
      </div>

      {/* Deactivate modal */}
      {showDeactivate && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
            <h2 className="font-semibold text-charcoal mb-2">
              Deactivate {customer.name}?
            </h2>
            <p className="text-sm text-sage mb-4">
              All future scheduled services will be cancelled. This action requires a reason.
            </p>
            <textarea
              className="w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest min-h-[80px] placeholder:text-stone mb-4"
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="Reason for deactivation…"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeactivate(false)}
                className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={actionLoading || !deactivateReason.trim()}
                className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
              >
                {actionLoading ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal removed — using inline edit in Overview tab */}
    </div>
  );
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

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

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

type PlanOption = { id: string; name: string; visit_frequency: string; price: number };
type GardenerOption = { id: string; name: string };
type SlotInfo = { id: string; day_of_week: number; time_window_start: string; time_window_end: string; gardener_id: string; is_active: boolean };

const editInputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

function InlineEditForm({
  customer,
  customerId,
  societies,
  onClose,
  onSaved,
}: {
  customer: CustomerDetail;
  customerId: string;
  societies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(customer.phone_number ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [societyId, setSocietyId] = useState(customer.society?.id ?? "");
  const [newSocietyName, setNewSocietyName] = useState("");
  const [plantCountRange, setPlantCountRange] = useState(customer.plant_count_range ?? "");
  const [lightCondition, setLightCondition] = useState(customer.light_condition ?? "");
  const [wateringResponsibility, setWateringResponsibility] = useState<string[]>(customer.watering_responsibility ?? []);
  const [houseHelpPhone, setHouseHelpPhone] = useState(customer.house_help_phone ?? "");
  const [gardenNotes, setGardenNotes] = useState(customer.garden_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Plan & slot change
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showChangeSlot, setShowChangeSlot] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(customer.subscription?.plan?.id ?? "");
  const [slotDay, setSlotDay] = useState(0);
  const [slotTimeStart, setSlotTimeStart] = useState("09:00");
  const [slotTimeEnd, setSlotTimeEnd] = useState("10:00");
  const [slotGardenerId, setSlotGardenerId] = useState("");
  const [changingPlan, setChangingPlan] = useState(false);
  const [changingSlot, setChangingSlot] = useState(false);

  // Photos
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Care schedules
  const [newCareAnchors, setNewCareAnchors] = useState<Record<string, string>>({});
  const [savingCare, setSavingCare] = useState(false);

  // SWR fetches — shared keys with OverviewTab for cache sharing
  const { data: plansData } = useSWR("/api/ops/plans?active=true", fetcher);
  const { data: gardenersData } = useSWR("/api/ops/gardeners", fetcher);
  const { data: careTypesData } = useSWR("/api/ops/care-action-types", fetcher);
  const { data: photosData, mutate: mutatePhotos } = useSWR(
    `/api/ops/customers/${customerId}/photos`,
    fetcher
  );
  const { data: slotsData } = useSWR(
    `/api/ops/schedule/slots?customer_id=${customerId}`,
    fetcher
  );

  const plans: PlanOption[] = plansData?.data ?? [];
  const gardeners: GardenerOption[] = gardenersData?.data ?? [];
  const careActionTypes: { id: string; name: string; default_frequency_days: number }[] = careTypesData?.data ?? [];
  const photos: { id: string; storage_path: string; url?: string | null }[] = photosData?.data ?? [];
  const activeSlot: SlotInfo | null = (slotsData?.data ?? []).find((s: SlotInfo) => s.is_active) ?? null;

  // Sync slot form state when activeSlot loads
  useEffect(() => {
    if (activeSlot) {
      setSlotDay(activeSlot.day_of_week);
      setSlotTimeStart(activeSlot.time_window_start);
      setSlotTimeEnd(activeSlot.time_window_end);
      setSlotGardenerId(activeSlot.gardener_id);
    }
  }, [activeSlot]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      // Create new society if needed
      let finalSocietyId = societyId || null;
      if (!societyId && newSocietyName.trim()) {
        const socRes = await fetch("/api/ops/societies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newSocietyName.trim() }),
        });
        const socJson = await socRes.json();
        if (socRes.ok && socJson.data?.id) {
          finalSocietyId = socJson.data.id;
        }
      }

      const res = await fetch(`/api/ops/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          phone_number: phoneNumber || undefined,
          email: email || null,
          address: address || null,
          society_id: finalSocietyId,
          plant_count_range: plantCountRange || null,
          light_condition: lightCondition || null,
          watering_responsibility: wateringResponsibility.length > 0 ? wateringResponsibility : null,
          house_help_phone: houseHelpPhone || null,
          garden_notes: gardenNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
      setSaved(true);
      setTimeout(() => { onSaved(); }, 500);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePlan() {
    if (!selectedPlanId) return;
    setChangingPlan(true);
    setError(null);
    const res = await fetch(`/api/ops/customers/${customerId}/assign-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: selectedPlanId }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to change plan"); setChangingPlan(false); return; }
    setShowChangePlan(false);
    setChangingPlan(false);
    onSaved();
  }

  async function handleChangeSlot() {
    if (!slotGardenerId) return;
    setChangingSlot(true);
    setError(null);

    if (activeSlot) {
      // Permanent reschedule — deactivate old, create new, regenerate services
      const res = await fetch("/api/ops/schedule/slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_id: activeSlot.id,
          day_of_week: slotDay,
          time_window_start: slotTimeStart,
          time_window_end: slotTimeEnd,
          gardener_id: slotGardenerId,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to update slot"); setChangingSlot(false); return; }
    } else {
      // Create new slot
      const res = await fetch("/api/ops/schedule/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          gardener_id: slotGardenerId,
          day_of_week: slotDay,
          time_window_start: slotTimeStart,
          time_window_end: slotTimeEnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to create slot"); setChangingSlot(false); return; }
    }
    setShowChangeSlot(false);
    setChangingSlot(false);
    onSaved();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("photo", compressed);
    const res = await fetch(`/api/ops/customers/${customerId}/photos`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      mutatePhotos();
    } else {
      try {
        const json = await res.json();
        setError(json.error ?? "Photo upload failed");
      } catch {
        setError("Photo upload failed — please try a different image");
      }
    }
    e.target.value = "";
    setUploadingPhoto(false);
  }

  async function handleDeletePhoto(photoId: string) {
    setDeletingPhotoId(photoId);
    const res = await fetch(`/api/ops/customers/${customerId}/photos?photo_id=${photoId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      mutatePhotos();
    } else {
      try {
        const json = await res.json();
        setError(json.error ?? "Failed to delete photo");
      } catch {
        setError("Failed to delete photo");
      }
    }
    setDeletingPhotoId(null);
  }

  const lightboxPhotos = photos.filter((p) => p.url).map((p) => ({ url: p.url! }));

  return (
    // NOTE: Keep fields in sync with onboarding wizard at src/app/(ops)/ops/customers/new/page.tsx
    <div className="space-y-5">
      {/* Section: Customer Details */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Customer Details</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1">Name</label>
            <input className={editInputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1">Phone</label>
            <input className={editInputCls} type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-charcoal mb-1">Email <span className="text-sage text-[10px]">(optional)</span></label>
            <input className={editInputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-charcoal mb-1">Address</label>
            <input className={editInputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Apt 6092, WoYM" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-charcoal mb-1">Society</label>
            <select className={editInputCls} value={societyId} onChange={(e) => { setSocietyId(e.target.value); if (e.target.value) setNewSocietyName(""); }}>
              <option value="">Select or add new…</option>
              {societies.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
            {!societyId && (
              <input
                className={`${editInputCls} mt-2`}
                value={newSocietyName}
                onChange={(e) => setNewSocietyName(e.target.value)}
                placeholder="Or type new society name"
              />
            )}
          </div>
        </div>
      </div>

      {/* Section: Garden Details */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Garden Details</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1">Plant count range</label>
            <div className="flex gap-2">
              {PLANT_RANGES.map((r) => (
                <button key={r.value} type="button" onClick={() => setPlantCountRange(r.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${plantCountRange === r.value ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"}`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1">Light condition</label>
            <input className={editInputCls} value={lightCondition} onChange={(e) => setLightCondition(e.target.value)} placeholder="e.g. North-facing, partial shade" />
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal mb-2">Watering responsibility</label>
            <div className="flex gap-2 flex-wrap">
              {WATERING_OPTIONS.map((w) => {
                const sel = wateringResponsibility.includes(w.value);
                return (
                  <button key={w.value} type="button"
                    onClick={() => setWateringResponsibility(sel ? wateringResponsibility.filter((v) => v !== w.value) : [...wateringResponsibility, w.value])}
                    className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${sel ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"}`}
                  >{w.label}</button>
                );
              })}
            </div>
          </div>
          {wateringResponsibility.includes("house_help") && (
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">House help phone</label>
              <input className={editInputCls} type="tel" value={houseHelpPhone} onChange={(e) => setHouseHelpPhone(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1">Garden notes</label>
            <textarea className={`${editInputCls} min-h-[80px]`} value={gardenNotes} onChange={(e) => setGardenNotes(e.target.value)} placeholder="Any notes about the garden…" />
          </div>
        </div>
      </div>

      {/* Section: Garden Photos */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Garden Photos</p>
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
                onClick={() => handleDeletePhoto(p.id)}
                disabled={deletingPhotoId === p.id}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-terra text-offwhite rounded-full flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50"
                title="Delete photo"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {photos.length === 0 && (
            <p className="text-sm text-stone">No photos uploaded yet</p>
          )}
        </div>
        {lightboxIndex !== null && lightboxPhotos.length > 0 && (
          <PhotoLightbox
            photos={lightboxPhotos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
        {photos.length < 3 && (
          <div>
            <input
              type="file"
              accept="image/*"

              onChange={handlePhotoUpload}
              disabled={uploadingPhoto}
              id="edit-photo-input"
              className="hidden"
            />
            <label
              htmlFor="edit-photo-input"
              className={`inline-flex items-center gap-1.5 px-3 py-2 border border-stone rounded-xl text-xs font-medium text-charcoal hover:border-forest cursor-pointer ${
                uploadingPhoto ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Camera size={14} />
              {uploadingPhoto ? "Uploading…" : `Add Photo (${photos.length}/3)`}
            </label>
          </div>
        )}
      </div>

      {/* Section: Plan */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Current Plan</p>
          <button onClick={() => setShowChangePlan(!showChangePlan)} className="text-xs text-forest hover:text-garden font-medium">
            {showChangePlan ? "Cancel" : "Change Plan"}
          </button>
        </div>
        {customer.subscription?.plan ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-sage">Plan</span><span className="text-charcoal font-medium">{customer.subscription.plan.name} — ₹{customer.subscription.plan.price}/mo</span></div>
            <div className="flex justify-between"><span className="text-sage">Frequency</span><span className="text-charcoal font-medium">{FREQ_LABEL[customer.subscription.plan.visit_frequency] ?? customer.subscription.plan.visit_frequency}</span></div>
          </div>
        ) : (
          <p className="text-sm text-stone">No plan assigned</p>
        )}
        {showChangePlan && (
          <div className="mt-3 pt-3 border-t border-stone/30 space-y-2">
            {plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${selectedPlanId === plan.id ? "border-forest bg-[#EAF2EC]" : "border-stone/60 hover:border-forest/40"}`}
              >
                <div className="flex justify-between">
                  <span className="font-medium text-charcoal">{plan.name}</span>
                  <span className="text-forest">₹{plan.price}/mo</span>
                </div>
                <span className="text-xs text-sage">{FREQ_LABEL[plan.visit_frequency] ?? plan.visit_frequency}</span>
              </button>
            ))}
            <button onClick={handleChangePlan} disabled={changingPlan || !selectedPlanId}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40">
              {changingPlan ? "Changing…" : "Apply Plan Change"}
            </button>
            <p className="text-xs text-sage">If the frequency changes, future services will be regenerated automatically.</p>
          </div>
        )}
      </div>

      {/* Section: Primary Slot */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-sage uppercase tracking-widest">Primary Slot</p>
          <button onClick={() => setShowChangeSlot(!showChangeSlot)} className="text-xs text-forest hover:text-garden font-medium">
            {showChangeSlot ? "Cancel" : activeSlot ? "Change Slot" : "Assign Slot"}
          </button>
        </div>
        {activeSlot ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-sage">Day</span><span className="text-charcoal font-medium">{DAY_LABELS[activeSlot.day_of_week]}</span></div>
            <div className="flex justify-between"><span className="text-sage">Time</span><span className="text-charcoal font-medium">{activeSlot.time_window_start} – {activeSlot.time_window_end}</span></div>
            <div className="flex justify-between"><span className="text-sage">Gardener</span><span className="text-charcoal font-medium">{gardeners.find((g) => g.id === activeSlot.gardener_id)?.name ?? "—"}</span></div>
          </div>
        ) : (
          <p className="text-sm text-stone">No slot assigned</p>
        )}
        {showChangeSlot && (
          <div className="mt-3 pt-3 border-t border-stone/30 space-y-3">
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Day</label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map((day, i) => (
                  <button key={i} type="button" onClick={() => setSlotDay(i)}
                    className={`py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${slotDay === i ? "bg-forest text-offwhite border-forest" : "bg-cream text-charcoal border-stone"}`}
                  >{day.slice(0, 3)}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Start</label>
                <input type="time" className={editInputCls} value={slotTimeStart} onChange={(e) => setSlotTimeStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">End</label>
                <input type="time" className={editInputCls} value={slotTimeEnd} onChange={(e) => setSlotTimeEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Gardener</label>
              <select className={editInputCls} value={slotGardenerId} onChange={(e) => setSlotGardenerId(e.target.value)}>
                <option value="">Select gardener…</option>
                {gardeners.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
            </div>
            <button onClick={handleChangeSlot} disabled={changingSlot || !slotGardenerId}
              className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40">
              {changingSlot ? "Saving…" : activeSlot ? "Apply Slot Change" : "Create Slot"}
            </button>
            {activeSlot && <p className="text-xs text-sage">This will cancel future services from the old slot and generate new ones.</p>}
          </div>
        )}
      </div>

      {/* Section: Existing Observations (read-only) */}
      {customer.observations.length > 0 && (
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">Observations</p>
          {customer.observations.map((obs) => (
            <p key={obs.id} className="text-sm text-charcoal py-1 border-b border-stone/20 last:border-0">{obs.text}</p>
          ))}
        </div>
      )}

      {/* Section: Care Schedules */}
      <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
        <p className="text-xs font-medium text-sage uppercase tracking-widest mb-3">Care Schedules</p>

        {/* Existing schedules */}
        {customer.care_schedules.length > 0 && (
          <div className="space-y-1 mb-3">
            {customer.care_schedules.map((cs) => (
              <div key={cs.id} className="flex justify-between text-sm py-1.5">
                <span className="text-charcoal">{CARE_LABELS[cs.care_action_name ?? ""] ?? cs.care_action_name}</span>
                <span className="text-sage">Anchor: {cs.cycle_anchor_date} · Next: {cs.next_due_date ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
        {customer.care_schedules.length === 0 && (
          <p className="text-sm text-terra mb-3">No care schedules configured — set anchor dates below.</p>
        )}

        {/* Add/update care schedules */}
        {(() => {
          const existingTypeIds = new Set(customer.care_schedules.map((cs) => cs.care_action_type_id));
          const unconfigured = careActionTypes.filter((ct) => !existingTypeIds.has(ct.id));
          const configured = careActionTypes.filter((ct) => existingTypeIds.has(ct.id));
          const allTypes = [...unconfigured, ...configured];

          if (allTypes.length === 0) return null;

          return (
            <div className="pt-3 border-t border-stone/30 space-y-2">
              <p className="text-xs text-sage mb-1">{unconfigured.length > 0 ? "Set anchor dates:" : "Update anchor dates:"}</p>
              {allTypes.map((ct) => {
                const existing = customer.care_schedules.find((cs) => cs.care_action_type_id === ct.id);
                return (
                  <div key={ct.id} className="flex items-center gap-3">
                    <span className="text-sm text-charcoal w-32 flex-shrink-0">
                      {CARE_LABELS[ct.name] ?? ct.name}
                    </span>
                    <input
                      type="date"
                      className={`${editInputCls} flex-1`}
                      value={newCareAnchors[ct.id] ?? existing?.cycle_anchor_date ?? ""}
                      onChange={(e) => setNewCareAnchors((prev) => ({ ...prev, [ct.id]: e.target.value }))}
                    />
                    <span className="text-xs text-sage whitespace-nowrap">every {ct.default_frequency_days}d</span>
                  </div>
                );
              })}
              {Object.keys(newCareAnchors).length > 0 && (
                <button
                  onClick={async () => {
                    setSavingCare(true);
                    setError(null);
                    for (const [typeId, date] of Object.entries(newCareAnchors)) {
                      if (!date) continue;
                      await fetch(`/api/ops/customers/${customerId}/care-schedules`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ care_action_type_id: typeId, cycle_anchor_date: date }),
                      });
                    }
                    setSavingCare(false);
                    setNewCareAnchors({});
                    onSaved();
                  }}
                  disabled={savingCare}
                  className="w-full py-2 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
                >
                  {savingCare ? "Saving…" : "Save Care Schedules"}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Actions */}
      {error && <p className="text-sm text-terra">{error}</p>}
      {saved && <p className="text-sm text-forest">Saved successfully!</p>}

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

type SlotInfoView = { id: string; day_of_week: number; time_window_start: string; time_window_end: string; gardener_id: string; is_active: boolean };

function OverviewTab({ customer, customerId }: { customer: CustomerDetail; customerId: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // SWR fetches — shared keys with InlineEditForm for cache sharing
  const { data: photosData, isLoading: photosLoading } = useSWR(
    `/api/ops/customers/${customerId}/photos`,
    fetcher
  );
  const { data: slotsData, isLoading: slotsLoading } = useSWR(
    `/api/ops/schedule/slots?customer_id=${customerId}`,
    fetcher
  );
  const { data: gardenersData } = useSWR("/api/ops/gardeners", fetcher);

  const photos: { id: string; storage_path: string; url?: string | null }[] = photosData?.data ?? [];
  const gardeners: { id: string; name: string }[] = gardenersData?.data ?? [];
  const slot: SlotInfoView | null = (slotsData?.data ?? []).find((s: SlotInfoView) => s.is_active) ?? null;
  const gardenerName = slot ? (gardeners.find((g) => g.id === slot.gardener_id)?.name ?? null) : null;

  return (
    <div className="space-y-5">
      {/* Garden Photos */}
      <Card title="Garden Photos">
        {photosLoading ? (
          <div className="flex gap-2 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="w-20 h-20 bg-stone/20 rounded-xl flex-shrink-0" />
            ))}
          </div>
        ) : photos.length > 0 ? (
          <>
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className="w-20 h-20 bg-cream rounded-xl border border-stone/40 flex-shrink-0 overflow-hidden cursor-pointer hover:border-forest/60 transition-colors"
                onClick={() => p.url && setLightboxIndex(i)}
              >
                {p.url ? (
                  <img src={p.url} alt="Garden photo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-sage text-center px-1 break-all flex items-center justify-center w-full h-full">{p.storage_path.split("/").pop()}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-sage mt-2">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
          {lightboxIndex !== null && (
            <PhotoLightbox
              photos={photos.filter((p) => p.url).map((p) => ({ url: p.url! }))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </>
        ) : (
          <p className="text-sm text-stone">No photos uploaded yet — click Edit to add.</p>
        )}
      </Card>

      {/* Customer Details */}
      <Card title="Customer Details">
        <Row label="Name" value={customer.name} />
        <Row label="Phone" value={customer.phone_number ?? "—"} />
        <Row label="Email" value={customer.email ?? "—"} />
        <Row label="Address" value={customer.address ?? "—"} />
        <Row label="Society" value={customer.society?.name ?? "—"} />
      </Card>

      {/* Current Plan */}
      <Card title="Current Plan">
        {customer.subscription?.plan ? (
          <>
            <Row label="Plan" value={customer.subscription.plan.name} />
            <Row label="Price" value={`₹${customer.subscription.plan.price}/mo`} />
            <Row label="Frequency" value={FREQ_LABEL[customer.subscription.plan.visit_frequency] ?? customer.subscription.plan.visit_frequency} />
          </>
        ) : (
          <p className="text-sm text-stone">No plan assigned</p>
        )}
      </Card>

      {/* Primary Slot */}
      <Card title="Primary Slot">
        {slotsLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3.5 w-16 bg-stone/20 rounded" />
                <div className="h-3.5 w-28 bg-stone/20 rounded" />
              </div>
            ))}
          </div>
        ) : slot ? (
          <>
            <Row label="Day" value={DAY_LABELS[slot.day_of_week] ?? "—"} />
            <Row label="Time" value={`${slot.time_window_start} – ${slot.time_window_end}`} />
            <Row label="Gardener" value={gardenerName ?? "—"} />
          </>
        ) : (
          <p className="text-sm text-stone">No slot assigned</p>
        )}
      </Card>

      {/* Garden Details */}
      <Card title="Garden Details">
        <Row
          label="Plants"
          value={
            customer.plant_count_range
              ? PLANT_LABEL[customer.plant_count_range] ?? customer.plant_count_range
              : "—"
          }
        />
        <Row label="Light" value={customer.light_condition ?? "—"} />
        <Row
          label="Watering"
          value={
            customer.watering_responsibility && customer.watering_responsibility.length > 0
              ? customer.watering_responsibility
                  .map((w) => w === "house_help" ? "House help" : w === "self" ? "Self" : w === "others" ? "Others" : w)
                  .join(", ")
              : "—"
          }
        />
        {customer.watering_responsibility?.includes("house_help") && (
          <Row label="House help phone" value={customer.house_help_phone ?? "—"} />
        )}
        {customer.garden_notes && (
          <div className="mt-3 pt-3 border-t border-stone/30">
            <p className="text-xs font-medium text-sage mb-1">Garden Notes</p>
            <p className="text-sm text-charcoal leading-relaxed">{customer.garden_notes}</p>
          </div>
        )}
      </Card>

      {/* Care Schedules */}
      <Card title="Care Schedules">
        {customer.care_schedules.length > 0 ? (
          customer.care_schedules.map((cs) => {
            const isOverdue =
              cs.next_due_date &&
              cs.next_due_date < new Date().toISOString().split("T")[0];
            return (
              <div
                key={cs.id}
                className="flex items-center justify-between py-1.5"
              >
                <span className="text-sm text-charcoal flex items-center gap-1.5">
                  <Leaf size={14} className="text-sage" />
                  {CARE_LABELS[cs.care_action_name ?? ""] ??
                    cs.care_action_name ??
                    "Unknown"}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isOverdue ? "text-terra" : "text-sage"
                  }`}
                >
                  {isOverdue && <AlertCircle size={12} className="inline mr-1" />}
                  {cs.next_due_date
                    ? `Due ${cs.next_due_date}`
                    : "Not scheduled"}
                </span>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-terra">No care schedules configured — click Edit to set up.</p>
        )}
      </Card>

      {/* Observations */}
      {customer.observations.length > 0 && (
        <Card title="Observations">
          {customer.observations.map((obs) => (
            <div
              key={obs.id}
              className="py-2 border-b border-stone/20 last:border-0"
            >
              <p className="text-sm text-charcoal leading-relaxed">{obs.text}</p>
              <p className="text-xs text-sage mt-1">
                {new Date(obs.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </Card>
      )}

      {/* Deactivation info */}
      {customer.status === "INACTIVE" && customer.deactivation_reason && (
        <Card title="Deactivation">
          <p className="text-sm text-terra leading-relaxed">{customer.deactivation_reason}</p>
        </Card>
      )}
    </div>
  );
}

function ServicesTab({ services }: { services: Service[] }) {
  if (services.length === 0) {
    return (
      <p className="text-sm text-stone text-center py-10">
        No services scheduled yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {services.map((svc) => {
        const cls = SERVICE_STATUS_CLS[svc.status] ?? "bg-stone/30 text-charcoal";
        return (
          <Link
            key={svc.id}
            href={`/ops/services/${svc.id}`}
            className="block bg-offwhite rounded-2xl border border-stone/60 px-4 py-3 flex items-center justify-between hover:border-forest/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-charcoal flex items-center gap-2">
                <Calendar size={14} className="text-sage" />
                {svc.scheduled_date}
              </p>
              {svc.time_window_start && (
                <p className="text-xs text-sage ml-5">
                  {svc.time_window_start} – {svc.time_window_end}
                </p>
              )}
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}
            >
              {svc.status.replace("_", " ")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function RequestsTab({ requests }: { requests: CustRequest[] }) {
  if (requests.length === 0) {
    return <p className="text-sm text-stone text-center py-10">No requests.</p>;
  }

  const TYPE_CLS: Record<string, string> = {
    problem: "bg-terra/10 text-terra",
    service_request: "bg-forest/10 text-forest",
    other: "bg-stone/30 text-charcoal",
  };
  const STATUS_CLS: Record<string, string> = {
    open: "bg-terra/10 text-terra",
    in_progress: "bg-forest/10 text-forest",
    resolved: "bg-[#EAF2EC] text-sage",
    closed: "bg-stone/30 text-sage",
  };

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="bg-offwhite rounded-2xl border border-stone/60 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_CLS[r.type] ?? "bg-stone/30 text-charcoal"}`}>
              {r.type === "service_request" ? "Service Request" : r.type === "problem" ? "Problem" : "Other"}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[r.status] ?? "bg-stone/30 text-charcoal"}`}>
              {r.status.replace("_", " ")}
            </span>
          </div>
          {r.description && <p className="text-sm text-charcoal line-clamp-2">{r.description}</p>}
          <p className="text-xs text-sage mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}

function BillingTab({ bills }: { bills: CustBill[] }) {
  if (bills.length === 0) {
    return <p className="text-sm text-stone text-center py-10">No bills.</p>;
  }

  return (
    <div className="space-y-2">
      {bills.map((b) => (
        <div key={b.id} className={`bg-offwhite rounded-2xl border px-4 py-3 ${b.is_overdue ? "border-terra/40" : "border-stone/60"}`}>
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-charcoal text-sm">₹{b.amount_inr}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              b.status === "paid" ? "bg-[#EAF2EC] text-sage" : b.is_overdue ? "bg-terra/10 text-terra" : "bg-cream text-charcoal"
            }`}>
              {b.is_overdue ? "Overdue" : b.status === "paid" ? "Paid" : "Pending"}
            </span>
          </div>
          <p className="text-xs text-sage">
            {b.billing_period_start} → {b.billing_period_end} · Due: {b.due_date}
          </p>
          {b.paid_at && <p className="text-xs text-sage">Paid {new Date(b.paid_at).toLocaleDateString()}</p>}
        </div>
      ))}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-5">
      <p className="text-xs font-medium text-terra uppercase tracking-widest mb-3">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start text-sm py-1.5">
      <span className="text-sage min-w-[120px] flex-shrink-0">{label}</span>
      <span className="text-charcoal font-medium text-right">{value}</span>
    </div>
  );
}
