"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Image as ImageIcon,
  Volume2,
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

const inputCls =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest placeholder:text-stone";

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

  async function handleAddTask(description: string) {
    if (!nextServiceId) return;
    await fetch(`/api/ops/services/${serviceId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        for_service_id: nextServiceId,
        description,
      }),
    });
    setShowTaskModal(false);
    load();
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
            onClick={() => router.push("/ops/services")}
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
              {service.scheduled_date}{" "}
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
                ? new Date(service.reviewed_at).toLocaleDateString()
                : "Not yet"
            }
          />
        </Card>

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

        {/* Care actions */}
        {service.care_actions_due.length > 0 && (
          <Card title="Care Actions">
            {service.care_actions_due.map((ca) => (
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
              <div key={task.id} className="flex items-center gap-2 py-1 text-sm">
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

        {/* Photos */}
        <Card title={`Photos (${photos.length})`}>
          {photos.length === 0 ? (
            <p className="text-xs text-stone">No photos uploaded</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) =>
                p.signed_url ? (
                  <button
                    key={p.id}
                    onClick={() => setLightboxIndex(i)}
                    className="aspect-square rounded-xl overflow-hidden border border-stone/40 hover:border-forest/40"
                  >
                    <img
                      src={p.signed_url}
                      alt={p.caption ?? "Service photo"}
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
              photos={photos.filter((p) => p.signed_url).map((p) => ({ url: p.signed_url!, alt: p.caption ?? undefined }))}
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
              <audio controls className="w-full h-8" src={voiceNote.signed_url}>
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <p className="text-xs text-stone">No voice note</p>
          )}
        </Card>

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
          onSubmit={handleAddTask}
        />
      )}
    </div>
  );
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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
  onSubmit: (desc: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit(description);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-20 px-4">
      <div className="bg-offwhite rounded-2xl shadow-xl w-full max-w-[480px] p-6">
        <h2 className="font-semibold text-charcoal mb-3">
          Add Task for Next Visit
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Check pest on money plant"
            required
            autoFocus
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
              {saving ? "Adding…" : "Add Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
