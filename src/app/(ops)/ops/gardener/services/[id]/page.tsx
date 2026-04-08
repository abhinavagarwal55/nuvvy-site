"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Camera,
  Mic,
  Check,
  X,
  Minus,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { compressImage } from "@/lib/utils/compress-image";
import PhotoLightbox from "../../../../components/PhotoLightbox";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  label: string;
  is_required: boolean;
  order_index: number;
  completion_status: string;
};

type CareActionDue = {
  care_schedule_id: string;
  care_action_type_id: string;
  care_action_name: string;
  frequency_days: number;
  next_due_date: string;
  is_done: boolean;
};

type SpecialTask = {
  id: string;
  description: string;
  is_completed: boolean;
};

type ServiceDetail = {
  id: string;
  customer_id: string;
  status: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  started_at: string | null;
  customer: { id: string; name: string; phone_number: string | null } | null;
  checklist_items: ChecklistItem[];
  special_tasks: SpecialTask[];
  care_actions_due: CareActionDue[];
  photo_count: number;
  photos: { id: string; storage_path: string; tag: string; caption: string | null; signed_url: string | null }[];
  voice_note_count: number;
};

const CARE_LABELS: Record<string, string> = {
  fertilizer: "Fertilizer",
  vermi_compost: "Vermi Compost",
  micro_nutrients: "Micro Nutrients",
  neem_oil: "Neem Oil",
};

const NOT_COMPLETED_REASONS = [
  "Customer not available",
  "No access to premises",
  "Weather conditions",
  "Other",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ServiceExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const { data, error, isLoading, mutate } = useSWR(
    `/api/ops/gardener/services/${serviceId}`,
    fetcher
  );

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showNotCompleted, setShowNotCompleted] = useState(false);
  const [ncReason, setNcReason] = useState("");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const service: ServiceDetail | null = data?.data ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-forest" />
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <p className="text-sm text-terra">Failed to load service.</p>
      </div>
    );
  }

  const isScheduled = service.status === "scheduled";
  const isInProgress = service.status === "in_progress";
  const isDone = service.status === "completed" || service.status === "not_completed";
  const canComplete = isInProgress && service.photo_count >= 2;
  const voiceInputRef = useRef<HTMLInputElement>(null);

  // ─── Actions ──────────────────────────────────────────────────────────

  async function handleStart() {
    setActionLoading("start");
    await fetch(`/api/ops/services/${serviceId}/start`, { method: "POST" });
    await mutate();
    setActionLoading(null);
  }

  async function handleComplete() {
    setActionLoading("complete");
    const res = await fetch(`/api/ops/services/${serviceId}/complete`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? "Failed to complete");
      setActionLoading(null);
      return;
    }
    await mutate();
    setActionLoading(null);
  }

  async function handleNotCompleted() {
    if (!ncReason) return;
    setActionLoading("not_completed");
    await fetch(`/api/ops/services/${serviceId}/not-completed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: ncReason }),
    });
    setShowNotCompleted(false);
    await mutate();
    setActionLoading(null);
  }

  async function handleChecklistToggle(item: ChecklistItem) {
    const nextStatus =
      item.completion_status === "done"
        ? "pending"
        : item.completion_status === "pending"
        ? "done"
        : "pending";

    await fetch(
      `/api/ops/services/${serviceId}/checklist/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completion_status: nextStatus }),
      }
    );
    mutate();
  }

  async function handleChecklistNotRequired(item: ChecklistItem) {
    await fetch(
      `/api/ops/services/${serviceId}/checklist/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completion_status: "not_required" }),
      }
    );
    mutate();
  }

  async function handleCareAction(action: CareActionDue) {
    await fetch(
      `/api/ops/services/${serviceId}/care-actions/${action.care_action_type_id}`,
      { method: "POST" }
    );
    mutate();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading("photo");

    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("photo", compressed);
    formData.append("tag", "general");

    await fetch(`/api/ops/gardener/services/${serviceId}/photos`, {
      method: "POST",
      body: formData,
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
    await mutate();
    setActionLoading(null);
  }

  async function handlePhotoDelete(photoId: string) {
    setActionLoading("photo-delete");
    await fetch(`/api/ops/gardener/services/${serviceId}/photos?photo_id=${photoId}`, {
      method: "DELETE",
    });
    await mutate();
    setActionLoading(null);
  }

  const servicePhotos = service?.photos?.filter((p) => p.signed_url) ?? [];

  async function handleVoiceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading("voice");
    const formData = new FormData();
    formData.append("voice", file);
    await fetch(`/api/ops/gardener/services/${serviceId}/voice`, {
      method: "POST",
      body: formData,
    });
    if (voiceInputRef.current) voiceInputRef.current.value = "";
    await mutate();
    setActionLoading(null);
  }

  async function handleRequestSubmit(type: string, description: string) {
    await fetch("/api/ops/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: service!.customer_id,
        service_id: serviceId,
        type,
        description,
      }),
    });
    setShowRequestModal(false);
  }

  const dayLabel = new Date(service.scheduled_date + "T00:00:00").toLocaleDateString(
    "en-IN",
    { weekday: "long" }
  );

  return (
    <div className="min-h-screen bg-cream pb-36">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/ops/gardener/today")}
            className="text-charcoal hover:text-forest"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl text-charcoal truncate"
              style={{
                fontFamily: "var(--font-cormorant, serif)",
                fontWeight: 500,
              }}
            >
              {service.customer?.name ?? "Customer"}
            </h1>
            <p className="text-xs text-sage">
              {dayLabel}{" "}
              {service.time_window_start &&
                `${service.time_window_start} – ${service.time_window_end}`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-[480px] mx-auto space-y-4">
        {/* Start button for scheduled services */}
        {isScheduled && (
          <button
            onClick={handleStart}
            disabled={actionLoading === "start"}
            className="w-full py-3.5 bg-forest text-offwhite rounded-2xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {actionLoading === "start" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              "Start Service"
            )}
          </button>
        )}

        {/* Special Tasks */}
        {service.special_tasks.length > 0 && (
          <SectionCard title="Special Tasks">
            {service.special_tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 py-2 border-b border-stone/20 last:border-0"
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                    task.is_completed
                      ? "bg-forest border-forest"
                      : "border-stone"
                  }`}
                >
                  {task.is_completed && <Check size={12} className="text-offwhite" />}
                </div>
                <span
                  className={`text-sm ${
                    task.is_completed
                      ? "text-sage line-through"
                      : "text-charcoal"
                  }`}
                >
                  {task.description}
                </span>
              </div>
            ))}
          </SectionCard>
        )}

        {/* Care Actions Due */}
        {service.care_actions_due.length > 0 && (
          <SectionCard title="Care Actions Due">
            {service.care_actions_due.map((action) => (
              <div
                key={action.care_action_type_id}
                className="flex items-center justify-between py-2.5 border-b border-stone/20 last:border-0"
              >
                <div>
                  <p className="text-sm text-charcoal">
                    {CARE_LABELS[action.care_action_name] ?? action.care_action_name}
                  </p>
                  <p className="text-xs text-sage">Due {action.next_due_date}</p>
                </div>
                {isInProgress && (
                  <button
                    onClick={() => handleCareAction(action)}
                    disabled={action.is_done}
                    className={`min-w-[64px] py-1.5 px-3 rounded-xl text-xs font-medium ${
                      action.is_done
                        ? "bg-[#EAF2EC] text-sage"
                        : "bg-forest text-offwhite hover:bg-garden"
                    }`}
                  >
                    {action.is_done ? "Done" : "Mark Done"}
                  </button>
                )}
              </div>
            ))}
          </SectionCard>
        )}

        {/* Checklist */}
        {service.checklist_items.length > 0 && (
          <SectionCard title="Checklist">
            {service.checklist_items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2.5 border-b border-stone/20 last:border-0"
              >
                {/* Toggle button */}
                <button
                  onClick={() => isInProgress && handleChecklistToggle(item)}
                  disabled={!isInProgress}
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    item.completion_status === "done"
                      ? "bg-forest border-forest"
                      : item.completion_status === "not_required"
                      ? "bg-stone/30 border-stone"
                      : "border-stone hover:border-forest"
                  }`}
                >
                  {item.completion_status === "done" && (
                    <Check size={14} className="text-offwhite" />
                  )}
                  {item.completion_status === "not_required" && (
                    <Minus size={14} className="text-sage" />
                  )}
                </button>

                <span
                  className={`text-sm flex-1 ${
                    item.completion_status === "done"
                      ? "text-sage line-through"
                      : item.completion_status === "not_required"
                      ? "text-stone line-through"
                      : "text-charcoal"
                  }`}
                >
                  {item.label}
                </span>

                {/* N/A button */}
                {isInProgress && item.completion_status !== "not_required" && (
                  <button
                    onClick={() => handleChecklistNotRequired(item)}
                    className="text-[10px] text-sage border border-stone/40 rounded px-1.5 py-0.5 hover:bg-cream"
                  >
                    N/A
                  </button>
                )}
              </div>
            ))}
          </SectionCard>
        )}

        {/* Photos */}
        {(isInProgress || isDone) && (
          <SectionCard title={`Photos (${service.photo_count})`}>
            {service.photo_count < 2 && isInProgress && (
              <p className="text-xs text-terra flex items-center gap-1 mb-2">
                <AlertTriangle size={12} />
                At least 2 photos required to complete
              </p>
            )}

            {/* Photo thumbnails */}
            {servicePhotos.length > 0 && (
              <div className="flex gap-3 overflow-x-auto mb-3">
                {servicePhotos.map((p, i) => (
                  <div key={p.id} className="relative flex-shrink-0">
                    <div
                      className="w-20 h-20 bg-cream rounded-xl border border-stone/40 overflow-hidden cursor-pointer hover:border-forest/60 transition-colors"
                      onClick={() => setLightboxIndex(i)}
                    >
                      <img src={p.signed_url!} alt={p.caption ?? "Visit photo"} className="w-full h-full object-cover" />
                    </div>
                    {isInProgress && (
                      <button
                        onClick={() => handlePhotoDelete(p.id)}
                        disabled={actionLoading === "photo-delete"}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-terra text-offwhite rounded-full flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50"
                        title="Delete photo"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isInProgress && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={actionLoading === "photo"}
                  className="w-full py-3 border-2 border-dashed border-stone rounded-xl text-sm text-sage hover:border-forest hover:text-forest flex items-center justify-center gap-2"
                >
                  {actionLoading === "photo" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Camera size={16} /> Take Photo
                    </>
                  )}
                </button>
              </>
            )}

            {lightboxIndex !== null && servicePhotos.length > 0 && (
              <PhotoLightbox
                photos={servicePhotos.map((p) => ({ url: p.signed_url!, alt: p.caption ?? undefined }))}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
          </SectionCard>
        )}

        {/* Log Request */}
        {isInProgress && (
          <button
            onClick={() => setShowRequestModal(true)}
            className="w-full py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite flex items-center justify-center gap-1.5"
          >
            + Log a problem or request
          </button>
        )}

        {/* Voice Note */}
        {(isInProgress || isDone) && (
          <SectionCard
            title={`Voice Note${service.voice_note_count > 0 ? " (1)" : ""}`}
          >
            {isInProgress && (
              <>
                <input
                  ref={voiceInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleVoiceUpload}
                  className="hidden"
                />
                <button
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={actionLoading === "voice"}
                  className="w-full py-3 border-2 border-dashed border-stone rounded-xl text-sm text-sage hover:border-forest hover:text-forest flex items-center justify-center gap-2"
                >
                  {actionLoading === "voice" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Mic size={16} />{" "}
                      {service.voice_note_count > 0
                        ? "Replace Voice Note"
                        : "Add Voice Note"}
                    </>
                  )}
                </button>
              </>
            )}
            {isDone && service.voice_note_count > 0 && (
              <p className="text-xs text-sage">Voice note recorded</p>
            )}
            {isDone && service.voice_note_count === 0 && (
              <p className="text-xs text-stone">No voice note</p>
            )}
          </SectionCard>
        )}
      </div>

      {/* Bottom action bar */}
      {isInProgress && (
        <div className="fixed bottom-0 left-0 right-0 bg-offwhite border-t border-stone px-4 py-3 z-20">
          <div className="max-w-[480px] mx-auto space-y-2">
            <button
              onClick={handleComplete}
              disabled={!canComplete || actionLoading === "complete"}
              className="w-full py-3 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {actionLoading === "complete" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Check size={16} /> Complete Service
                </>
              )}
            </button>
            <button
              onClick={() => setShowNotCompleted(true)}
              className="w-full py-2.5 border border-stone rounded-xl text-sm text-terra hover:bg-terra/5"
            >
              Mark as Not Completed
            </button>
          </div>
        </div>
      )}

      {/* Not completed modal */}
      {showNotCompleted && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
            <h2 className="font-semibold text-charcoal mb-3">
              Why couldn&apos;t this visit be completed?
            </h2>
            <div className="space-y-2 mb-4">
              {NOT_COMPLETED_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setNcReason(reason)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                    ncReason === reason
                      ? "border-terra bg-terra/5 text-terra"
                      : "border-stone text-charcoal hover:border-terra/40"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNotCompleted(false)}
                className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
              >
                Cancel
              </button>
              <button
                onClick={handleNotCompleted}
                disabled={!ncReason || actionLoading === "not_completed"}
                className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
              >
                {actionLoading === "not_completed" ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request modal */}
      {showRequestModal && (
        <RequestModal
          onClose={() => setShowRequestModal(false)}
          onSubmit={handleRequestSubmit}
        />
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
      <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function RequestModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (type: string, description: string) => void;
}) {
  const [type, setType] = useState("problem");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit(type, description);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
        <h2 className="font-semibold text-charcoal mb-3">Log Request</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            {["problem", "service_request", "other"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  type === t
                    ? "bg-forest text-offwhite border-forest"
                    : "bg-cream text-charcoal border-stone"
                }`}
              >
                {t === "problem"
                  ? "Problem"
                  : t === "service_request"
                  ? "Service Request"
                  : "Other"}
              </button>
            ))}
          </div>
          <textarea
            className="w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest min-h-[80px] placeholder:text-stone"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue…"
            required
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !description.trim()}
              className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
            >
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
