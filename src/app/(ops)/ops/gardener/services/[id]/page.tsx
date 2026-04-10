"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Camera,
  Mic,
  Check,
  AlertTriangle,
  Loader2,
  Trash2,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";
import { compressImage } from "@/lib/utils/compress-image";
import PhotoLightbox from "../../../../components/PhotoLightbox";
import {
  useServiceDraft,
  clearDraft,
  type IssueType,
} from "./use-service-draft";

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

type Photo = {
  id: string;
  storage_path: string;
  tag: string;
  caption: string | null;
  signed_url: string | null;
};

type ServiceDetail = {
  id: string;
  customer_id: string;
  status: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  started_at: string | null;
  not_completed_reason: string | null;
  customer: { id: string; name: string; phone_number: string | null } | null;
  checklist_items: ChecklistItem[];
  special_tasks: SpecialTask[];
  care_actions_due: CareActionDue[];
  photo_count: number;
  photos: Photo[];
  voice_note_count: number;
};

const CARE_LABELS: Record<string, string> = {
  fertilizer: "Apply Fertilizer",
  vermi_compost: "Apply Vermi Compost",
  micro_nutrients: "Apply Micro Nutrients",
  neem_oil: "Apply Neem Oil",
};

const ISSUE_OPTIONS = [
  { value: "leaves_drooping", label: "Leaves drooping" },
  { value: "pest_infected", label: "Plant infected with pest" },
  { value: "other", label: "Other (describe)" },
] as const;

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [completionState, setCompletionState] = useState<{
    done: boolean;
    issueRaised: boolean;
    clientRequestRaised: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const issueFileInputRef = useRef<HTMLInputElement>(null);
  // voiceInputRef removed — VoiceRecorder component handles its own state

  const service: ServiceDetail | null = data?.data ?? null;
  const isInProgress = service?.status === "in_progress";

  const {
    draft,
    updateChecklist,
    toggleCareAction,
    toggleSpecialTask,
    updateIssue,
    addIssuePhotoId,
    setHasClientRequest,
  } = useServiceDraft(serviceId, isInProgress ?? false);

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
  const isDone =
    service.status === "completed" || service.status === "not_completed";

  // Photo helpers
  const generalPhotos = (service.photos ?? []).filter(
    (p) => p.signed_url && p.tag === "general"
  );
  const issuePhotos = (service.photos ?? []).filter(
    (p) => p.signed_url && p.tag === "issue"
  );
  const generalPhotoCount = generalPhotos.length;

  const dayLabel = new Date(
    service.scheduled_date + "T00:00:00"
  ).toLocaleDateString("en-IN", { weekday: "long" });

  // Checklist state helper — use draft if in_progress, otherwise use server state
  function getChecklistStatus(item: ChecklistItem) {
    if (isInProgress && draft.checklistState[item.id]) {
      return draft.checklistState[item.id];
    }
    return item.completion_status;
  }

  function isCareActionDone(typeId: string) {
    if (isInProgress) return draft.careActionsDone.includes(typeId);
    return false;
  }

  function isSpecialTaskDone(taskId: string) {
    if (isInProgress) return draft.specialTasksDone.includes(taskId);
    return false;
  }

  // Determine if end service is possible
  const canEnd = isInProgress && generalPhotoCount >= 2;

  // ─── Actions ──────────────────────────────────────────────────────────

  async function handleStart() {
    setActionLoading("start");
    await fetch(`/api/ops/services/${serviceId}/start`, { method: "POST" });
    await mutate();
    setActionLoading(null);
  }

  async function handleEndService() {
    if (!canEnd) return;
    setActionLoading("end");

    // Build checklist payload from draft + server items
    const checklist = service!.checklist_items.map((item) => ({
      id: item.id,
      completion_status: (draft.checklistState[item.id] ??
        item.completion_status) as "done" | "pending" | "not_required",
    }));

    // Build issues array — one entry per selected type
    const issues =
      draft.issueState.hasIssues && draft.issueState.types?.length
        ? draft.issueState.types.map((t) => ({
            type: t,
            description:
              t === "other" ? draft.issueState.description : undefined,
            photo_ids: draft.issueState.photoIds,
            communicated_to_customer:
              draft.issueState.communicatedToCustomer,
          }))
        : [];

    const payload = {
      checklist,
      care_actions_done: draft.careActionsDone,
      special_tasks_done: draft.specialTasksDone,
      issues,
      has_client_request: draft.hasClientRequest,
    };

    const res = await fetch(`/api/ops/services/${serviceId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? "Failed to end service");
      setActionLoading(null);
      return;
    }

    clearDraft(serviceId);
    setCompletionState({
      done: true,
      issueRaised: json.issue_raised ?? false,
      clientRequestRaised: json.client_request_raised ?? false,
    });
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
    clearDraft(serviceId);
    setShowNotCompleted(false);
    await mutate();
    setActionLoading(null);
  }

  async function handlePhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    tag: "general" | "issue"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading(tag === "issue" ? "issue-photo" : "photo");

    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("photo", compressed);
    formData.append("tag", tag);

    const res = await fetch(
      `/api/ops/gardener/services/${serviceId}/photos`,
      { method: "POST", body: formData }
    );
    const json = await res.json();

    if (tag === "issue" && json.data?.id) {
      addIssuePhotoId(json.data.id);
    }

    // Reset input
    if (tag === "general" && fileInputRef.current)
      fileInputRef.current.value = "";
    if (tag === "issue" && issueFileInputRef.current)
      issueFileInputRef.current.value = "";
    await mutate();
    setActionLoading(null);
  }

  async function handlePhotoDelete(photoId: string) {
    setActionLoading("photo-delete");
    await fetch(
      `/api/ops/gardener/services/${serviceId}/photos?photo_id=${photoId}`,
      { method: "DELETE" }
    );
    await mutate();
    setActionLoading(null);
  }


  // ─── Completion Screen ────────────────────────────────────────────────

  if (completionState?.done) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="bg-offwhite rounded-2xl border border-stone/60 p-8 max-w-[400px] w-full text-center space-y-4">
          <CheckCircle2 size={48} className="text-forest mx-auto" />
          <h2
            className="text-xl text-charcoal"
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            Service Completed
          </h2>
          {completionState.issueRaised && (
            <div className="bg-terra/10 rounded-xl px-4 py-3 text-sm text-terra">
              <CircleAlert size={16} className="inline mr-1.5 -mt-0.5" />
              Issue raised to Horticulturist. They will be in touch.
            </div>
          )}
          {completionState.clientRequestRaised && (
            <p className="text-sm text-sage">
              Client request has been logged.
            </p>
          )}
          <button
            onClick={() => router.push("/ops/gardener/today")}
            className="w-full py-3 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden"
          >
            Back to Today
          </button>
        </div>
      </div>
    );
  }

  // ─── Guidelines View (Page 1 — Scheduled services only) ───────────────

  if (isScheduled) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <Header
          customerName={service.customer?.name ?? "Customer"}
          dayLabel={dayLabel}
          timeLabel={
            service.time_window_start
              ? `${service.time_window_start} – ${service.time_window_end}`
              : undefined
          }
          onBack={() => router.push("/ops/gardener/today")}
          badge="Preview"
        />

        <div className="px-4 pt-4 max-w-[480px] mx-auto space-y-4">
          {/* Guidelines */}
          <SectionCard title="Nuvvy Service Guidelines">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-forest uppercase tracking-wide mb-1.5">
                  Do&apos;s
                </p>
                <ul className="space-y-2">
                  {DOS_LIST.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-charcoal"
                    >
                      <Check
                        size={14}
                        className="text-forest flex-shrink-0 mt-0.5"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-stone/30 pt-3">
                <p className="text-xs font-medium text-terra uppercase tracking-wide mb-1.5">
                  Don&apos;ts
                </p>
                <ul className="space-y-2">
                  {DONTS_LIST.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-charcoal"
                    >
                      <AlertTriangle
                        size={14}
                        className="text-terra flex-shrink-0 mt-0.5"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>

          {/* Start Service */}
          <button
            onClick={handleStart}
            disabled={actionLoading === "start"}
            className="w-full py-3.5 bg-forest text-offwhite rounded-2xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {actionLoading === "start" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                Start Service <ChevronRight size={16} />
              </>
            )}
          </button>

          {/* Preview: Checklist (read-only) */}
          <PreviewChecklist service={service} />
        </div>
      </div>
    );
  }

  // ─── Done View (read-only summary) ────────────────────────────────────

  if (isDone) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <Header
          customerName={service.customer?.name ?? "Customer"}
          dayLabel={dayLabel}
          timeLabel={
            service.time_window_start
              ? `${service.time_window_start} – ${service.time_window_end}`
              : undefined
          }
          onBack={() => router.push("/ops/gardener/today")}
          badge={service.status === "completed" ? "Completed" : "Not Completed"}
        />
        <div className="px-4 pt-4 max-w-[480px] mx-auto space-y-4">
          <PreviewChecklist service={service} />
          {generalPhotos.length > 0 && (
            <SectionCard title={`Photos (${generalPhotos.length})`}>
              <div className="flex gap-3 overflow-x-auto">
                {generalPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="w-20 h-20 bg-cream rounded-xl border border-stone/40 overflow-hidden flex-shrink-0"
                  >
                    <img
                      src={p.signed_url!}
                      alt="Visit photo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {service.not_completed_reason && (
            <SectionCard title="Reason">
              <p className="text-sm text-charcoal">
                {service.not_completed_reason}
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    );
  }

  // ─── Execution View (Page 2 — In Progress) ────────────────────────────

  // Merge special tasks + care actions into one "Tasks for Today" list
  const hasSpecialTasks =
    service.special_tasks.length > 0 || service.care_actions_due.length > 0;

  return (
    <div className="min-h-screen bg-cream pb-36">
      <Header
        customerName={service.customer?.name ?? "Customer"}
        dayLabel={dayLabel}
        timeLabel={
          service.time_window_start
            ? `${service.time_window_start} – ${service.time_window_end}`
            : undefined
        }
        onBack={() => router.push("/ops/gardener/today")}
      />

      <div className="px-4 pt-4 max-w-[480px] mx-auto space-y-4">
        {/* 1. Special Tasks for Today */}
        {hasSpecialTasks && (
          <SectionCard title="Special Tasks for Today">
            {/* Care actions due */}
            {service.care_actions_due.map((action) => {
              const done = isCareActionDone(action.care_action_type_id);
              return (
                <div
                  key={action.care_action_type_id}
                  className="flex items-center gap-3 py-2.5 border-b border-stone/20 last:border-0"
                >
                  <button
                    onClick={() =>
                      toggleCareAction(action.care_action_type_id, !done)
                    }
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      done
                        ? "bg-forest border-forest"
                        : "border-stone hover:border-forest"
                    }`}
                  >
                    {done && <Check size={14} className="text-offwhite" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm ${
                        done ? "text-sage line-through" : "text-charcoal"
                      }`}
                    >
                      {CARE_LABELS[action.care_action_name] ??
                        action.care_action_name}
                    </span>
                    <p className="text-xs text-sage">
                      Due {action.next_due_date}
                    </p>
                  </div>
                </div>
              );
            })}
            {/* Horticulturist-added tasks */}
            {service.special_tasks.map((task) => {
              const done = isSpecialTaskDone(task.id);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 py-2.5 border-b border-stone/20 last:border-0"
                >
                  <button
                    onClick={() => toggleSpecialTask(task.id, !done)}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      done
                        ? "bg-forest border-forest"
                        : "border-stone hover:border-forest"
                    }`}
                  >
                    {done && <Check size={14} className="text-offwhite" />}
                  </button>
                  <span
                    className={`text-sm flex-1 ${
                      done ? "text-sage line-through" : "text-charcoal"
                    }`}
                  >
                    {task.description}
                  </span>
                </div>
              );
            })}
          </SectionCard>
        )}

        {/* 2. Regular Checklist */}
        {service.checklist_items.length > 0 && (
          <SectionCard title="Service Checklist">
            {service.checklist_items.map((item) => {
              const status = getChecklistStatus(item);
              const done = status === "done";
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-2.5 border-b border-stone/20 last:border-0"
                >
                  <button
                    onClick={() =>
                      updateChecklist(item.id, done ? "pending" : "done")
                    }
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      done
                        ? "bg-forest border-forest"
                        : "border-stone hover:border-forest"
                    }`}
                  >
                    {done && <Check size={14} className="text-offwhite" />}
                  </button>
                  <span
                    className={`text-sm flex-1 ${
                      done ? "text-sage line-through" : "text-charcoal"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </SectionCard>
        )}

        {/* 3. Photos — wide shots */}
        <SectionCard
          title={`Balcony Photos (${generalPhotoCount}/5)`}
        >
          {generalPhotoCount < 2 && (
            <p className="text-xs text-terra flex items-center gap-1 mb-2">
              <AlertTriangle size={12} />
              At least 2 wide-shot photos required
            </p>
          )}

          {generalPhotos.length > 0 && (
            <div className="flex gap-3 overflow-x-auto mb-3">
              {generalPhotos.map((p, i) => (
                <div key={p.id} className="relative flex-shrink-0">
                  <div
                    className="w-20 h-20 bg-cream rounded-xl border border-stone/40 overflow-hidden cursor-pointer hover:border-forest/60 transition-colors"
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img
                      src={p.signed_url!}
                      alt="Balcony photo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => handlePhotoDelete(p.id)}
                    disabled={actionLoading === "photo-delete"}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-terra text-offwhite rounded-full flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {generalPhotoCount < 5 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handlePhotoUpload(e, "general")}
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
                    <Camera size={16} /> Take Wide Shot Photo
                  </>
                )}
              </button>
            </>
          )}

          {lightboxIndex !== null && generalPhotos.length > 0 && (
            <PhotoLightbox
              photos={generalPhotos.map((p) => ({
                url: p.signed_url!,
                alt: "Balcony photo",
              }))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </SectionCard>

        {/* 4. Issues */}
        <SectionCard title="Issues">
          <div className="space-y-3">
            {/* No issues / Yes toggle */}
            <div className="flex gap-2">
              <button
                onClick={() =>
                  updateIssue({ hasIssues: false })
                }
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  !draft.issueState.hasIssues
                    ? "bg-forest text-offwhite border-forest"
                    : "bg-cream text-charcoal border-stone"
                }`}
              >
                No issues
              </button>
              <button
                onClick={() =>
                  updateIssue({ ...draft.issueState, hasIssues: true })
                }
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  draft.issueState.hasIssues
                    ? "bg-terra text-offwhite border-terra"
                    : "bg-cream text-charcoal border-stone"
                }`}
              >
                Yes, I see issues
              </button>
            </div>

            {/* Issue details */}
            {draft.issueState.hasIssues && (
              <div className="space-y-3 border-t border-stone/30 pt-3">
                {/* Issue type multi-select */}
                <p className="text-xs text-sage">Select all that apply:</p>
                <div className="space-y-2">
                  {ISSUE_OPTIONS.map((opt) => {
                    const selected = (
                      draft.issueState.types ?? []
                    ).includes(opt.value as IssueType);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const current = draft.issueState.types ?? [];
                          const next = selected
                            ? current.filter((t) => t !== opt.value)
                            : [...current, opt.value as IssueType];
                          updateIssue({ ...draft.issueState, types: next });
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors flex items-center gap-2.5 ${
                          selected
                            ? "border-terra bg-terra/5 text-terra"
                            : "border-stone text-charcoal hover:border-terra/40"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            selected
                              ? "bg-terra border-terra"
                              : "border-stone"
                          }`}
                        >
                          {selected && (
                            <Check size={10} className="text-offwhite" />
                          )}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Other description */}
                {(draft.issueState.types ?? []).includes("other") && (
                  <textarea
                    className="w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest min-h-[60px] placeholder:text-stone"
                    value={draft.issueState.description ?? ""}
                    onChange={(e) =>
                      updateIssue({
                        ...draft.issueState,
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe the issue…"
                  />
                )}

                {/* Issue photo */}
                {(draft.issueState.types ?? []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-terra flex items-center gap-1">
                      <Camera size={12} />
                      Please take a photo of the issue
                    </p>

                    {issuePhotos.length > 0 && (
                      <div className="flex gap-2">
                        {issuePhotos.map((p) => (
                          <div key={p.id} className="relative flex-shrink-0">
                            <div className="w-16 h-16 bg-cream rounded-xl border border-terra/40 overflow-hidden">
                              <img
                                src={p.signed_url!}
                                alt="Issue photo"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <button
                              onClick={() => handlePhotoDelete(p.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-terra text-offwhite rounded-full flex items-center justify-center"
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <input
                      ref={issueFileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handlePhotoUpload(e, "issue")}
                      className="hidden"
                    />
                    <button
                      onClick={() => issueFileInputRef.current?.click()}
                      disabled={actionLoading === "issue-photo"}
                      className="w-full py-2 border border-dashed border-terra/40 rounded-xl text-xs text-terra hover:bg-terra/5 flex items-center justify-center gap-1.5"
                    >
                      {actionLoading === "issue-photo" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Camera size={14} /> Take Issue Photo
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Communicated to customer */}
                {(draft.issueState.types ?? []).length > 0 && (
                  <label className="flex items-start gap-2 py-2 cursor-pointer">
                    <button
                      onClick={() =>
                        updateIssue({
                          ...draft.issueState,
                          communicatedToCustomer:
                            !draft.issueState.communicatedToCustomer,
                        })
                      }
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        draft.issueState.communicatedToCustomer
                          ? "bg-forest border-forest"
                          : "border-stone"
                      }`}
                    >
                      {draft.issueState.communicatedToCustomer && (
                        <Check size={12} className="text-offwhite" />
                      )}
                    </button>
                    <span className="text-sm text-charcoal">
                      I have communicated this issue to the customer
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* 5. Client Requests — Voice Note */}
        <SectionCard title="Client Requests">
          <p className="text-xs text-sage mb-2">
            Record a voice note if the customer has any requests
          </p>
          <VoiceRecorder
            serviceId={serviceId}
            hasExisting={service.voice_note_count > 0}
            onUploaded={() => {
              setHasClientRequest(true);
              mutate();
            }}
          />
        </SectionCard>
      </div>

      {/* 6. Bottom action bar — End Service */}
      <div
        className="fixed left-0 right-0 bg-offwhite border-t border-stone px-4 py-3 z-20"
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="max-w-[480px] mx-auto space-y-2">
          <button
            onClick={handleEndService}
            disabled={!canEnd || actionLoading === "end"}
            className="w-full py-3 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {actionLoading === "end" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Check size={16} /> End Service
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
    </div>
  );
}

// ─── Static Content ──────────────────────────────────────────────────────────

const DOS_LIST = [
  "Greet the customer at entry.",
  "After service, tell customer about what you did, issues identified and what you could not do.",
  "Ask customers about concerns or if they want additional plants.",
  "Call your horticulturist if you don't know what to do.",
  "If you apply neem oil, tell customer to not visit garden for 2-3 hours.",
];

const DONTS_LIST = [
  "Prune plants without talking to customer first.",
];

// ─── Shared Components ──────────────────────────────────────────────────────

function Header({
  customerName,
  dayLabel,
  timeLabel,
  onBack,
  badge,
}: {
  customerName: string;
  dayLabel: string;
  timeLabel?: string;
  onBack: () => void;
  badge?: string;
}) {
  return (
    <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
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
            {customerName}
          </h1>
          <p className="text-xs text-sage">
            {dayLabel} {timeLabel && `${timeLabel}`}
          </p>
        </div>
        {badge && (
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-cream text-charcoal border border-stone/40">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

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

/** In-app voice recorder using MediaRecorder API */
function VoiceRecorder({
  serviceId,
  hasExisting,
  onUploaded,
}: {
  serviceId: string;
  hasExisting: boolean;
  onUploaded: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recorded, setRecorded] = useState(hasExisting);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        await uploadBlob(blob);
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      alert("Microphone access is required to record voice notes.");
    }
  }

  function stopRecording() {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    }
    setRecording(false);
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true);
    const formData = new FormData();
    formData.append("voice", blob, "voice-note.webm");
    const res = await fetch(
      `/api/ops/gardener/services/${serviceId}/voice`,
      { method: "POST", body: formData }
    );
    if (res.ok) {
      setRecorded(true);
      onUploaded();
    } else {
      alert("Failed to upload voice note");
    }
    setUploading(false);
  }

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const timeLabel = `${mins}:${String(secs).padStart(2, "0")}`;

  if (uploading) {
    return (
      <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-sage">
        <Loader2 size={16} className="animate-spin" /> Uploading…
      </div>
    );
  }

  if (recording) {
    return (
      <button
        onClick={stopRecording}
        className="w-full py-3 bg-terra text-offwhite rounded-xl text-sm font-medium flex items-center justify-center gap-2 animate-pulse"
      >
        <span className="w-2.5 h-2.5 bg-offwhite rounded-full" />
        Recording {timeLabel} — Tap to Stop
      </button>
    );
  }

  return (
    <>
      <button
        onClick={startRecording}
        className="w-full py-3 border-2 border-dashed border-stone rounded-xl text-sm text-sage hover:border-forest hover:text-forest flex items-center justify-center gap-2"
      >
        <Mic size={16} />{" "}
        {recorded ? "Re-record Voice Note" : "Record Voice Note"}
      </button>
      {recorded && (
        <p className="text-xs text-forest mt-2 flex items-center gap-1">
          <Check size={12} /> Voice note recorded
        </p>
      )}
    </>
  );
}

/** Read-only preview of checklist, care actions, and special tasks */
function PreviewChecklist({ service }: { service: ServiceDetail }) {
  const CARE_PREVIEW: Record<string, string> = {
    fertilizer: "Apply Fertilizer",
    vermi_compost: "Apply Vermi Compost",
    micro_nutrients: "Apply Micro Nutrients",
    neem_oil: "Apply Neem Oil",
  };

  const hasSpecialItems =
    service.special_tasks.length > 0 || service.care_actions_due.length > 0;

  return (
    <>
      {hasSpecialItems && (
        <SectionCard title="Special Tasks for Today">
          {service.care_actions_due.map((action) => (
            <div
              key={action.care_action_type_id}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <div className="w-5 h-5 rounded-md border-2 border-stone flex-shrink-0" />
              <div>
                <span className={action.is_done ? "text-sage line-through" : "text-charcoal"}>
                  {CARE_PREVIEW[action.care_action_name] ??
                    action.care_action_name}
                </span>
                <p className="text-xs text-sage">Due {action.next_due_date}</p>
              </div>
            </div>
          ))}
          {service.special_tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                  task.is_completed
                    ? "bg-forest border-forest"
                    : "border-stone"
                }`}
              >
                {task.is_completed && (
                  <Check size={10} className="text-offwhite" />
                )}
              </div>
              <span
                className={
                  task.is_completed
                    ? "text-sage line-through"
                    : "text-charcoal"
                }
              >
                {task.description}
              </span>
            </div>
          ))}
        </SectionCard>
      )}

      {service.checklist_items.length > 0 && (
        <SectionCard title="Service Checklist">
          {service.checklist_items.map((item) => {
            const done = item.completion_status === "done";
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    done ? "bg-forest border-forest" : "border-stone"
                  }`}
                >
                  {done && <Check size={10} className="text-offwhite" />}
                </div>
                <span className={done ? "text-sage line-through" : "text-charcoal"}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </SectionCard>
      )}
    </>
  );
}
