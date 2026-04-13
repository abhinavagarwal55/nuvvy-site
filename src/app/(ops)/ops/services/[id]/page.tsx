"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/utils/format-date";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Image as ImageIcon,
  Volume2,
  CalendarClock,
  Ban,
  History,
} from "lucide-react";
import PhotoLightbox from "../../../components/PhotoLightbox";

type ServiceDetail = {
  id: string;
  customer_id: string;
  status: string;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  not_completed_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  customer: { name: string } | null;
  checklist_items: { id: string; label: string; completion_status: string }[];
  special_tasks: { id: string; description: string; is_completed: boolean }[];
  care_actions_due: {
    care_action_name: string;
    is_done: boolean;
    next_due_date: string;
  }[];
  care_actions_performed: {
    care_action_type_id: string;
    care_action_name: string;
    marked_done: boolean;
  }[];
  photo_count: number;
  voice_note_count: number;
};

type MediaPhoto = {
  id: string;
  storage_path: string;
  signed_url: string | null;
  tag: string | null;
  caption: string | null;
};

type MediaVoice = {
  id: string;
  signed_url: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  actor_role: string;
  metadata: Record<string, string | null>;
  created_at: string;
};

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

/** Generate 30-min time slots from 07:00 to 19:00 */
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = [];
  for (let h = 7; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) break;
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      slots.push({ value: val, label });
    }
  }
  return slots;
})();

function addOneHour(time: string): string {
  const [h, mm] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 19);
  return `${String(newH).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [nextServiceId, setNextServiceId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<MediaPhoto[]>([]);
  const [voiceNote, setVoiceNote] = useState<MediaVoice | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [issueLightboxIndex, setIssueLightboxIndex] = useState<number | null>(null);
  const [serviceRequests, setServiceRequests] = useState<
    {
      id: string;
      type: string;
      issue_type: string | null;
      description: string;
      status: string;
      communicated_to_customer: boolean | null;
    }[]
  >([]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  // Reschedule modal state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: "",
    new_start_time: "",
    new_end_time: "",
    reason: "",
  });
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  // Cancel modal state
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/gardener/services/${serviceId}`);
    const json = await res.json();
    setService(json.data ?? null);

    // Find next service for this customer (for "add task" feature)
    if (json.data?.customer_id) {
      const today = new Date().toISOString().split("T")[0];
      const svcRes = await fetch(
        `/api/ops/schedule/services?customer_id=${json.data.customer_id}&status=scheduled&date_from=${today}`
      );
      const svcJson = await svcRes.json();
      const upcoming = svcJson.data ?? [];
      if (upcoming.length > 0) setNextServiceId(upcoming[0].id);
    }

    // Fetch media (signed URLs)
    fetch(`/api/ops/services/${serviceId}/media`)
      .then((r) => r.json())
      .then((mediaJson) => {
        setPhotos(mediaJson.data?.photos ?? []);
        setVoiceNote(mediaJson.data?.voice_note ?? null);
      })
      .catch(() => {});

    // Fetch requests linked to this service
    if (json.data?.customer_id) {
      fetch(`/api/ops/requests?customer_id=${json.data.customer_id}`)
        .then((r) => r.json())
        .then((reqJson) => {
          const linked = (reqJson.data ?? []).filter(
            (r: { service_id: string }) => r.service_id === serviceId
          );
          setServiceRequests(linked);
        })
        .catch(() => {});
    }

    // Fetch audit history for this service
    fetch(`/api/ops/audit?target_table=service_visits&target_id=${serviceId}`)
      .then((r) => r.json())
      .then((auditJson) => {
        setAuditHistory(auditJson.data ?? []);
      })
      .catch(() => {});

    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview() {
    setReviewing(true);
    await fetch(`/api/ops/services/${serviceId}/review`, { method: "POST" });
    await load();
    setReviewing(false);
  }

  async function handleAddTasks(descriptions: string[]) {
    if (!nextServiceId) return;
    for (const desc of descriptions) {
      await fetch(`/api/ops/services/${serviceId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          for_service_id: nextServiceId,
          description: desc,
        }),
      });
    }
    setShowTaskModal(false);
    load();
  }

  async function handleReschedule() {
    setRescheduleSubmitting(true);
    const res = await fetch(
      `/api/ops/schedule/services/${serviceId}/reschedule`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_date: rescheduleForm.new_date,
          new_start_time: rescheduleForm.new_start_time || null,
          new_end_time: rescheduleForm.new_end_time || null,
          reason: rescheduleForm.reason,
        }),
      }
    );
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to reschedule");
      setRescheduleSubmitting(false);
      return;
    }
    setShowReschedule(false);
    setRescheduleForm({
      new_date: "",
      new_start_time: "",
      new_end_time: "",
      reason: "",
    });
    setRescheduleSubmitting(false);
    load();
  }

  async function handleCancel() {
    if (!cancelReason) return;
    setCancelSubmitting(true);
    const res = await fetch(`/api/ops/services/${serviceId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "Failed to cancel");
      setCancelSubmitting(false);
      return;
    }
    setShowCancel(false);
    setCancelReason("");
    setCancelSubmitting(false);
    load();
  }

  function handleStart() {
    // Redirect to execution page — it shows guidelines first, then handles start
    router.push(`/ops/gardener/services/${serviceId}`);
  }

  function openReschedule() {
    setRescheduleForm({
      new_date: service?.scheduled_date ?? "",
      new_start_time: service?.time_window_start?.slice(0, 5) ?? "",
      new_end_time: service?.time_window_end?.slice(0, 5) ?? "",
      reason: "",
    });
    setShowReschedule(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-sage">Loading…</p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-terra">Service not found</p>
      </div>
    );
  }

  const isReviewable =
    (service.status === "completed" || service.status === "not_completed") &&
    !service.reviewed_at;
  const canStart = service.status === "scheduled";
  const canReschedule = service.status === "scheduled";
  const canCancel = ["scheduled", "in_progress"].includes(service.status);

  const doneChecklist = service.checklist_items.filter(
    (i) => i.completion_status === "done"
  );
  const notReqChecklist = service.checklist_items.filter(
    (i) => i.completion_status === "not_required"
  );

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-charcoal hover:text-forest"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1
              className="text-xl text-charcoal"
              style={{
                fontFamily: "var(--font-cormorant, serif)",
                fontWeight: 500,
              }}
            >
              {service.customer?.name ?? "Service"}
            </h1>
            <p className="text-xs text-sage">
              {formatDate(service.scheduled_date)}{" "}
              {service.time_window_start &&
                `· ${service.time_window_start}–${service.time_window_end}`}
            </p>
          </div>
          <StatusBadge status={service.status} />
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[640px] mx-auto">
        {/* Timing */}
        <Card title="Timing">
          <Row label="Status" value={service.status.replace("_", " ")} />
          {service.started_at && (
            <Row
              label="Started"
              value={new Date(service.started_at).toLocaleTimeString()}
            />
          )}
          {service.completed_at && (
            <Row
              label="Completed"
              value={new Date(service.completed_at).toLocaleTimeString()}
            />
          )}
          {service.not_completed_reason && (
            <Row label="Reason" value={service.not_completed_reason} />
          )}
          <Row
            label="Reviewed"
            value={
              service.reviewed_at
                ? formatDateTime(service.reviewed_at)
                : "Not yet"
            }
          />
        </Card>

        {/* Start / Continue Service */}
        {canStart && (
          <button
            onClick={handleStart}
            className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden flex items-center justify-center gap-1.5"
          >
            Start Service
          </button>
        )}
        {service.status === "in_progress" && (
          <button
            onClick={() => router.push(`/ops/gardener/services/${serviceId}`)}
            className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden flex items-center justify-center gap-1.5"
          >
            Continue Service Execution
          </button>
        )}

        {/* Reschedule / Cancel actions */}
        {(canReschedule || canCancel) && (
          <div className="flex gap-2">
            {canReschedule && (
              <button
                onClick={openReschedule}
                className="flex-1 py-2 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite flex items-center justify-center gap-1.5"
              >
                <CalendarClock size={14} /> Reschedule
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowCancel(true)}
                className="flex-1 py-2 border border-terra/40 rounded-xl text-sm text-terra hover:bg-terra/5 flex items-center justify-center gap-1.5"
              >
                <Ban size={14} /> Cancel Service
              </button>
            )}
          </div>
        )}

        {/* Change History */}
        {auditHistory.length > 0 && (
          <Card title="Change History">
            {auditHistory.map((entry) => (
              <div
                key={entry.id}
                className="py-2 border-b border-stone/20 last:border-0"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <History size={12} className="text-sage flex-shrink-0" />
                  <span className="text-xs font-medium text-charcoal capitalize">
                    {formatAuditAction(entry.action)}
                  </span>
                  <span className="text-[10px] text-stone ml-auto">
                    {new Date(entry.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {entry.action === "schedule.rescheduled" &&
                  entry.metadata && (
                    <div className="ml-5 text-xs text-sage space-y-0.5">
                      {entry.metadata.old_date && (
                        <p>
                          From: {entry.metadata.old_date}
                          {entry.metadata.old_start_time &&
                            ` ${entry.metadata.old_start_time}–${entry.metadata.old_end_time}`}
                        </p>
                      )}
                      <p>
                        To: {entry.metadata.new_date}
                        {entry.metadata.new_start_time &&
                          ` ${entry.metadata.new_start_time}–${entry.metadata.new_end_time}`}
                      </p>
                      {entry.metadata.reason && (
                        <p className="text-charcoal">
                          Reason: {entry.metadata.reason}
                        </p>
                      )}
                    </div>
                  )}
                {entry.action === "service.cancelled" &&
                  entry.metadata?.reason && (
                    <p className="ml-5 text-xs text-charcoal">
                      Reason: {entry.metadata.reason}
                    </p>
                  )}
                {entry.action === "service.created" && (
                  <p className="ml-5 text-xs text-sage">
                    Service created for {entry.metadata?.scheduled_date ? formatDate(entry.metadata.scheduled_date) : ""}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* Checklist summary */}
        {service.checklist_items.length > 0 && (
          <Card title="Checklist">
            <p className="text-sm text-charcoal mb-2">
              {doneChecklist.length}/{service.checklist_items.length} done
              {notReqChecklist.length > 0 &&
                ` · ${notReqChecklist.length} N/A`}
            </p>
            {service.checklist_items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                {item.completion_status === "done" ? (
                  <CheckCircle size={14} className="text-forest" />
                ) : item.completion_status === "not_required" ? (
                  <XCircle size={14} className="text-stone" />
                ) : (
                  <Clock size={14} className="text-sage" />
                )}
                <span
                  className={
                    item.completion_status === "done"
                      ? "text-sage"
                      : item.completion_status === "not_required"
                      ? "text-stone line-through"
                      : "text-charcoal"
                  }
                >
                  {item.label}
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* Care actions — show performed actions for completed services, due actions otherwise */}
        {(service.care_actions_performed?.length > 0 ||
          service.care_actions_due.length > 0) && (
          <Card title="Care Actions">
            {service.care_actions_performed?.length > 0
              ? service.care_actions_performed.map((ca) => (
                  <div
                    key={ca.care_action_type_id}
                    className="flex items-center justify-between py-1 text-sm"
                  >
                    <span className="text-charcoal capitalize">
                      {ca.care_action_name.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        ca.marked_done ? "text-forest" : "text-terra"
                      }`}
                    >
                      {ca.marked_done ? "Done" : "Not done"}
                    </span>
                  </div>
                ))
              : service.care_actions_due.map((ca) => (
                  <div
                    key={ca.care_action_name}
                    className="flex items-center justify-between py-1 text-sm"
                  >
                    <span className="text-charcoal">{ca.care_action_name}</span>
                    <span
                      className={`text-xs font-medium ${
                        ca.is_done ? "text-forest" : "text-terra"
                      }`}
                    >
                      {ca.is_done ? "Done" : "Not done"}
                    </span>
                  </div>
                ))}
          </Card>
        )}

        {/* Special tasks */}
        {service.special_tasks.length > 0 && (
          <Card title="Special Tasks">
            {service.special_tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                {task.is_completed ? (
                  <CheckCircle size={14} className="text-forest" />
                ) : (
                  <Clock size={14} className="text-sage" />
                )}
                <span className="text-charcoal">{task.description}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Balcony Photos */}
        <Card title={`Balcony Photos (${photos.filter((p) => p.tag !== "issue").length})`}>
          {photos.filter((p) => p.tag !== "issue").length === 0 ? (
            <p className="text-xs text-stone">No photos uploaded</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos
                .filter((p) => p.tag !== "issue")
                .map((p, i) =>
                  p.signed_url ? (
                    <button
                      key={p.id}
                      onClick={() => setLightboxIndex(i)}
                      className="aspect-square rounded-xl overflow-hidden border border-stone/40 hover:border-forest/40"
                    >
                      <img
                        src={p.signed_url}
                        alt={p.caption ?? "Balcony photo"}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div
                      key={p.id}
                      className="aspect-square rounded-xl border border-stone/40 flex items-center justify-center"
                    >
                      <ImageIcon size={20} className="text-stone" />
                    </div>
                  )
                )}
            </div>
          )}
          {lightboxIndex !== null && (
            <PhotoLightbox
              photos={photos
                .filter((p) => p.tag !== "issue" && p.signed_url)
                .map((p) => ({
                  url: p.signed_url!,
                  alt: p.caption ?? undefined,
                }))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </Card>

        {/* Voice note */}
        <Card title="Voice Note">
          {voiceNote?.signed_url ? (
            <div className="flex items-center gap-3">
              <Volume2 size={16} className="text-forest flex-shrink-0" />
              <audio
                controls
                className="w-full h-8"
                src={voiceNote.signed_url}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <p className="text-xs text-stone">No voice note</p>
          )}
        </Card>

        {/* Issues & Client Requests */}
        {serviceRequests.length > 0 && (
          <Card title="Issues & Requests">
            {serviceRequests.map((req) => (
              <div
                key={req.id}
                className="py-2.5 border-b border-stone/20 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                      req.type === "client_request"
                        ? "bg-forest/10 text-forest"
                        : "bg-terra/10 text-terra"
                    }`}
                  >
                    {req.type === "client_request"
                      ? "Client Request"
                      : req.issue_type
                      ? req.issue_type.replace("_", " ")
                      : "Issue"}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                      req.status === "open"
                        ? "bg-terra/10 text-terra"
                        : req.status === "resolved"
                        ? "bg-[#EAF2EC] text-forest"
                        : "bg-cream text-charcoal"
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                <p className="text-sm text-charcoal mt-1">
                  {req.description}
                </p>
                {req.communicated_to_customer != null && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${req.communicated_to_customer ? "text-forest" : "text-terra"}`}>
                    {req.communicated_to_customer ? (
                      <><CheckCircle size={12} /> Communicated to customer</>
                    ) : (
                      <><XCircle size={12} /> Not communicated to customer</>
                    )}
                  </p>
                )}
              </div>
            ))}

            {/* Issue photos inline */}
            {photos.filter((p) => p.tag === "issue" && p.signed_url).length > 0 && (
              <div className="pt-2 mt-2 border-t border-stone/20">
                <p className="text-xs text-sage uppercase tracking-wide mb-1.5">
                  Issue Photos
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {photos
                    .filter((p) => p.tag === "issue" && p.signed_url)
                    .map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => setIssueLightboxIndex(i)}
                        className="aspect-square rounded-xl overflow-hidden border border-terra/40 hover:border-terra/60"
                      >
                        <img
                          src={p.signed_url!}
                          alt="Issue photo"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                </div>
                {issueLightboxIndex !== null && (
                  <PhotoLightbox
                    photos={photos
                      .filter((p) => p.tag === "issue" && p.signed_url)
                      .map((p) => ({
                        url: p.signed_url!,
                        alt: "Issue photo",
                      }))}
                    initialIndex={issueLightboxIndex}
                    onClose={() => setIssueLightboxIndex(null)}
                  />
                )}
              </div>
            )}
          </Card>
        )}

        {/* Actions */}
        {(isReviewable || nextServiceId) && (
          <div className="space-y-2 pt-2">
            {isReviewable && (
              <button
                onClick={handleReview}
                disabled={reviewing}
                className="w-full py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-40"
              >
                {reviewing ? "Marking…" : "Mark as Reviewed"}
              </button>
            )}
            {nextServiceId && (
              <button
                onClick={() => setShowTaskModal(true)}
                className="w-full py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-offwhite flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Add Task for Next Visit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add task modal */}
      {showTaskModal && (
        <AddTaskModal
          onClose={() => setShowTaskModal(false)}
          onSubmit={handleAddTasks}
        />
      )}

      {/* Reschedule modal */}
      {showReschedule && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
            <h2 className="font-semibold text-charcoal mb-3">
              Reschedule Service
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sage mb-1">
                  New date *
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={rescheduleForm.new_date}
                  onChange={(e) =>
                    setRescheduleForm((f) => ({
                      ...f,
                      new_date: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-sage mb-1">
                    Start time
                  </label>
                  <select
                    className={inputCls}
                    value={rescheduleForm.new_start_time}
                    onChange={(e) => {
                      const start = e.target.value;
                      setRescheduleForm((f) => ({
                        ...f,
                        new_start_time: start,
                        new_end_time: start ? addOneHour(start) : f.new_end_time,
                      }));
                    }}
                  >
                    <option value="">Select</option>
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-sage mb-1">
                    End time
                  </label>
                  <select
                    className={inputCls}
                    value={rescheduleForm.new_end_time}
                    onChange={(e) =>
                      setRescheduleForm((f) => ({
                        ...f,
                        new_end_time: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select</option>
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-sage mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Why is this being rescheduled?"
                  value={rescheduleForm.reason}
                  onChange={(e) =>
                    setRescheduleForm((f) => ({
                      ...f,
                      reason: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowReschedule(false)}
                  className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={
                    rescheduleSubmitting ||
                    !rescheduleForm.new_date ||
                    !rescheduleForm.reason
                  }
                  className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
                >
                  {rescheduleSubmitting ? "Saving…" : "Reschedule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
          <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
            <h2 className="font-semibold text-charcoal mb-3">
              Cancel Service
            </h2>
            <p className="text-sm text-sage mb-3">
              This cannot be undone. The service will be marked as cancelled.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sage mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Why is this being cancelled?"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowCancel(false)}
                  className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
                >
                  Go Back
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelSubmitting || !cancelReason.trim()}
                  className="flex-1 py-2.5 bg-terra text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
                >
                  {cancelSubmitting ? "Cancelling…" : "Cancel Service"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    "schedule.rescheduled": "Rescheduled",
    "service.cancelled": "Cancelled",
    "service.created": "Created",
    "service.completed": "Completed",
    "service.reviewed": "Reviewed",
  };
  return map[action] ?? action.replace(".", " ").replace("_", " ");
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-cream text-charcoal",
    in_progress: "bg-forest/10 text-forest",
    completed: "bg-[#EAF2EC] text-forest",
    not_completed: "bg-terra/10 text-terra",
    cancelled: "bg-stone/30 text-sage",
  };
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
        map[status] ?? "bg-stone/30 text-charcoal"
      }`}
    >
      {status.replace("_", " ")}
    </span>
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
    <div className="bg-offwhite rounded-2xl border border-stone/60 p-4">
      <p className="text-xs font-medium text-sage uppercase tracking-widest mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-sage">{label}</span>
      <span className="text-charcoal font-medium capitalize">{value}</span>
    </div>
  );
}

function AddTaskModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (descriptions: string[]) => void;
}) {
  const [tasks, setTasks] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  function updateTask(index: number, value: string) {
    setTasks((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addRow() {
    setTasks((prev) => [...prev, ""]);
  }

  function removeRow(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }

  const validTasks = tasks.filter((t) => t.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validTasks.length === 0) return;
    setSaving(true);
    await onSubmit(validTasks);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
        <h2 className="font-semibold text-charcoal mb-3">
          Add Tasks for Next Visit
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-sage mt-3 w-5 text-right flex-shrink-0">
                {i + 1}.
              </span>
              <input
                className={`${inputCls} flex-1`}
                value={task}
                onChange={(e) => updateTask(i, e.target.value)}
                placeholder="e.g. Check pest on money plant"
                autoFocus={i === tasks.length - 1}
              />
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="mt-2.5 text-stone hover:text-terra text-sm"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-forest hover:text-garden font-medium"
          >
            + Add another task
          </button>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || validTasks.length === 0}
              className="flex-1 py-2.5 bg-forest text-offwhite rounded-xl text-sm font-medium disabled:opacity-40"
            >
              {saving
                ? "Adding…"
                : `Add ${validTasks.length} Task${validTasks.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
