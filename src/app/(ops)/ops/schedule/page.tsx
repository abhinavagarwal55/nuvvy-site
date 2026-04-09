"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  MoreVertical,
  X,
} from "lucide-react";

/* ---------- Types ---------- */

type Service = {
  id: string;
  customer_id: string;
  customer_name: string;
  gardener_name: string | null;
  assigned_gardener_id: string | null;
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
};

type DropdownOption = { id: string; name: string };

/* ---------- Constants ---------- */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-forest/70",
  in_progress: "bg-forest",
  completed: "bg-sage",
  not_completed: "bg-terra",
  missed: "bg-terra",
  cancelled: "bg-stone",
};

/** Generate 30-min time slots from 07:00 to 19:00 for select dropdowns */
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = [];
  for (let h = 7; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) break; // stop at 19:00
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      slots.push({ value: val, label });
    }
  }
  return slots;
})();

/** Add 1 hour to a HH:MM string */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 19);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ---------- Helpers ---------- */

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekRange(date: Date): { from: string; to: string; label: string } {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    from: fmt(monday),
    to: fmt(sunday),
    label: `${monday.getDate()} ${monday.toLocaleString("en", { month: "short" })} – ${sunday.getDate()} ${sunday.toLocaleString("en", { month: "short" })} ${sunday.getFullYear()}`,
  };
}

/** Build a full datetime from a date string and HH:MM time string */
function toDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

/** Returns Tailwind classes for a service pill based on status + time windows */
function getServiceStatusColor(svc: Service, now: Date): string {
  switch (svc.status) {
    case "completed":
      return "bg-[#EAF2EC] border-l-forest";
    case "in_progress":
      return "bg-forest/5 border-l-forest";
    case "not_completed":
      return "bg-terra/5 border-l-terra";
    case "cancelled":
      return "bg-stone/10 border-l-stone line-through opacity-60";
    case "scheduled": {
      // Check time-window based coloring
      if (svc.time_window_end && svc.scheduled_date) {
        const windowEnd = toDateTime(svc.scheduled_date, svc.time_window_end);
        if (now > windowEnd) {
          return "bg-red-50 border-l-terra"; // missed window
        }
      }
      if (svc.time_window_start && svc.scheduled_date) {
        const windowStart = toDateTime(svc.scheduled_date, svc.time_window_start);
        if (now > windowStart) {
          return "bg-amber-50 border-l-amber-500"; // running late
        }
      }
      return "bg-forest/5 border-l-forest/60"; // future / default
    }
    default:
      return "bg-cream/50 border-l-stone";
  }
}

/** Returns a user-friendly status label + color class for the pill badge */
function getStatusLabel(svc: Service, now: Date): { text: string; cls: string } {
  switch (svc.status) {
    case "completed":
      return { text: "Complete", cls: "text-forest bg-[#EAF2EC]" };
    case "in_progress":
      return { text: "In Progress", cls: "text-forest bg-forest/10" };
    case "not_completed":
      return { text: "Not Completed", cls: "text-terra bg-terra/10" };
    case "cancelled":
      return { text: "Cancelled", cls: "text-stone bg-stone/20" };
    case "scheduled": {
      if (svc.time_window_end && svc.scheduled_date) {
        const windowEnd = toDateTime(svc.scheduled_date, svc.time_window_end);
        if (now > windowEnd) {
          return { text: "Past Due", cls: "text-terra bg-terra/10" };
        }
      }
      if (svc.time_window_start && svc.scheduled_date) {
        const windowStart = toDateTime(svc.scheduled_date, svc.time_window_start);
        if (now > windowStart) {
          return { text: "Running Late", cls: "text-amber-700 bg-amber-50" };
        }
      }
      return { text: "Not Started", cls: "text-charcoal/60 bg-cream" };
    }
    default:
      return { text: svc.status, cls: "text-stone bg-stone/10" };
  }
}

/** Sort services by time_window_start ascending; null times go last */
function sortByTime(a: Service, b: Service): number {
  if (a.time_window_start === b.time_window_start) return 0;
  if (a.time_window_start === null) return 1;
  if (b.time_window_start === null) return -1;
  return a.time_window_start.localeCompare(b.time_window_start);
}

/** Returns the correct link href for a service based on its status.
 *  Schedule page is admin/horti only — always link to the service detail view. */
function getServiceHref(svc: Service): string | null {
  if (svc.status === "cancelled") return null;
  return `/ops/services/${svc.id}`;
}

/* ---------- SWR fetcher ---------- */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ---------- Slide-up modal shell ---------- */

function SlideUpModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* panel */}
      <div className="relative w-full max-w-lg bg-offwhite rounded-t-2xl p-5 pb-8 mb-16 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            {title}
          </h2>
          <button onClick={onClose} className="p-1 text-sage hover:text-charcoal">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Three-dot dropdown on a service pill ---------- */

function PillDropdown({
  svc,
  onReschedule,
  onCancel,
}: {
  svc: Service;
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (svc.status !== "scheduled") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 text-sage hover:text-charcoal rounded-md"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-30 bg-offwhite border border-stone rounded-xl shadow-lg py-1 min-w-[130px]">
          <button
            className="w-full text-left px-3 py-2 text-sm text-charcoal hover:bg-cream"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onReschedule(svc);
            }}
          >
            Reschedule
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-terra hover:bg-cream"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onCancel(svc);
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Service | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Service | null>(null);

  // Form state — create
  const [createForm, setCreateForm] = useState({
    customer_id: "",
    gardener_id: "",
    date: "",
    start_time: "",
    end_time: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form state — reschedule
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: "",
    new_start_time: "",
    new_end_time: "",
    reason: "",
  });
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  // Form state — cancel
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Week calculation
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const week = getWeekRange(baseDate);

  // SWR: services
  const {
    data: servicesData,
    isLoading: loading,
    mutate,
  } = useSWR(`/api/ops/schedule/services?date_from=${week.from}&date_to=${week.to}`, fetcher);
  const services: Service[] = servicesData?.data ?? [];

  // SWR: customers + gardeners (for create modal — only fetch when modal is open)
  const { data: customersData } = useSWR(
    createOpen ? "/api/ops/customers?status=ACTIVE" : null,
    fetcher
  );
  const { data: gardenersData } = useSWR(
    createOpen ? "/api/ops/gardeners" : null,
    fetcher
  );
  const customers: DropdownOption[] = (customersData?.data ?? []).map(
    (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
  );
  const gardeners: DropdownOption[] = (gardenersData?.data ?? []).map(
    (g: { id: string; name: string }) => ({ id: g.id, name: g.name })
  );

  // Group by date and sort by time
  const byDate: Record<string, Service[]> = {};
  for (const svc of services) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
  }
  for (const key of Object.keys(byDate)) {
    byDate[key].sort(sortByTime);
  }

  // Generate all 7 days of the week
  const weekDays: { date: string; label: string; dayLabel: string }[] = [];
  const monday = new Date(week.from + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push({
      date: fmt(d),
      label: `${d.getDate()}`,
      dayLabel: DAY_LABELS[i],
    });
  }

  const today = fmt(new Date());
  const now = new Date();

  /* ---------- Handlers ---------- */

  async function handleCreate() {
    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/ops/services/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: createForm.customer_id,
          assigned_gardener_id: createForm.gardener_id || null,
          scheduled_date: createForm.date,
          time_window_start: createForm.start_time || null,
          time_window_end: createForm.end_time || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to create service");
        return;
      }
      mutate();
      setCreateOpen(false);
      setCreateForm({ customer_id: "", gardener_id: "", date: "", start_time: "", end_time: "" });
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleReschedule() {
    if (!rescheduleTarget) return;
    setRescheduleSubmitting(true);
    try {
      const res = await fetch(`/api/ops/schedule/services/${rescheduleTarget.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_date: rescheduleForm.new_date,
          new_start_time: rescheduleForm.new_start_time || null,
          new_end_time: rescheduleForm.new_end_time || null,
          reason: rescheduleForm.reason,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to reschedule");
        return;
      }
      mutate();
      setRescheduleTarget(null);
      setRescheduleForm({ new_date: "", new_start_time: "", new_end_time: "", reason: "" });
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      const res = await fetch(`/api/ops/services/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to cancel");
        return;
      }
      mutate();
      setCancelTarget(null);
      setCancelReason("");
    } finally {
      setCancelSubmitting(false);
    }
  }

  function openReschedule(svc: Service) {
    setRescheduleForm({
      new_date: svc.scheduled_date,
      new_start_time: svc.time_window_start ?? "",
      new_end_time: svc.time_window_end ?? "",
      reason: "",
    });
    setRescheduleTarget(svc);
  }

  function openCancel(svc: Service) {
    setCancelReason("");
    setCancelTarget(svc);
  }

  /* ---------- Pill rendering helpers ---------- */

  function renderDesktopPill(svc: Service) {
    const colorCls = getServiceStatusColor(svc, now);
    const href = getServiceHref(svc);
    const label = getStatusLabel(svc, now);

    const inner = (
      <>
        <div className="flex items-center justify-between gap-1">
          <p className="font-medium text-charcoal truncate text-sm">
            {svc.customer_name}
          </p>
          <PillDropdown svc={svc} onReschedule={openReschedule} onCancel={openCancel} />
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-charcoal/60 truncate text-xs">
            {svc.time_window_start ?? ""}{" "}
            {svc.gardener_name ? `· ${svc.gardener_name}` : ""}
          </p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${label.cls}`}>
            {label.text}
          </span>
        </div>
      </>
    );

    if (href) {
      return (
        <Link
          key={svc.id}
          href={href}
          className={`block rounded-lg border-l-[3px] px-2.5 py-2 ${colorCls} hover:shadow-sm transition-shadow`}
        >
          {inner}
        </Link>
      );
    }

    return (
      <div
        key={svc.id}
        className={`rounded-lg border-l-[3px] px-2.5 py-2 ${colorCls} cursor-default`}
      >
        {inner}
      </div>
    );
  }

  function renderMobilePill(svc: Service) {
    const colorCls = getServiceStatusColor(svc, now);
    const href = getServiceHref(svc);

    const inner = (
      <>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-charcoal">{svc.customer_name}</p>
          <div className="flex items-center gap-1.5">
            <PillDropdown svc={svc} onReschedule={openReschedule} onCancel={openCancel} />
            <span
              className={`w-2 h-2 rounded-full ${STATUS_DOT[svc.status] ?? "bg-stone"}`}
            />
            <span className="text-xs text-sage capitalize">
              {svc.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-sage mt-0.5">
          {svc.time_window_start && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {svc.time_window_start} – {svc.time_window_end}
            </span>
          )}
          {svc.gardener_name && <span>{svc.gardener_name}</span>}
        </div>
      </>
    );

    if (href) {
      return (
        <Link
          key={svc.id}
          href={href}
          className={`block bg-offwhite rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${colorCls} hover:shadow-sm transition-shadow`}
        >
          {inner}
        </Link>
      );
    }

    return (
      <div
        key={svc.id}
        className={`bg-offwhite rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${colorCls} cursor-default`}
      >
        {inner}
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Schedule
          </h1>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 bg-forest text-offwhite text-sm px-3 py-2 rounded-xl hover:bg-garden transition-colors"
          >
            <Plus size={16} />
            New Service
          </button>
        </div>

        {/* Week nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1 text-charcoal hover:text-forest"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-charcoal">{week.label}</p>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-forest hover:text-garden"
              >
                Jump to today
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1 text-charcoal hover:text-forest"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Desktop: weekly grid */}
      <div className="hidden md:block px-4 pt-4">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading...</p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {/* Column headers */}
            {weekDays.map((day) => {
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className={`text-center py-2 rounded-t-xl text-xs font-medium ${
                    isToday ? "bg-forest text-offwhite" : "bg-offwhite text-sage"
                  }`}
                >
                  {day.dayLabel} {day.label}
                </div>
              );
            })}
            {/* Day columns */}
            {weekDays.map((day) => {
              const dayServices = byDate[day.date] ?? [];
              return (
                <div
                  key={day.date}
                  className="bg-offwhite border border-stone/40 rounded-b-xl p-1.5 min-h-[120px] space-y-1"
                >
                  {dayServices.length === 0 ? (
                    <p className="text-[10px] text-stone text-center pt-4">&mdash;</p>
                  ) : (
                    dayServices.map((svc) => renderDesktopPill(svc))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile: day list */}
      <div className="md:hidden px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-sage text-center py-10">Loading...</p>
        ) : (
          weekDays.map((day) => {
            const dayServices = byDate[day.date] ?? [];
            const isToday = day.date === today;

            return (
              <div key={day.date}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-medium uppercase tracking-widest ${
                      isToday ? "text-forest" : "text-sage"
                    }`}
                  >
                    {day.dayLabel} {day.label}
                  </span>
                  {isToday && (
                    <span className="text-xs bg-forest text-offwhite px-1.5 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                  <span className="text-xs text-stone">
                    {dayServices.length > 0
                      ? `${dayServices.length} visit${dayServices.length !== 1 ? "s" : ""}`
                      : ""}
                  </span>
                </div>

                {dayServices.length === 0 ? (
                  <div className="bg-offwhite rounded-xl border border-stone/40 px-4 py-3 text-xs text-stone">
                    No visits
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {dayServices.map((svc) => renderMobilePill(svc))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ===== CREATE SERVICE MODAL ===== */}
      <SlideUpModal open={createOpen} onClose={() => setCreateOpen(false)} title="New Service">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sage mb-1">Customer *</label>
            <select
              className={INPUT_CLS}
              value={createForm.customer_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, customer_id: e.target.value }))}
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Gardener</label>
            <select
              className={INPUT_CLS}
              value={createForm.gardener_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, gardener_id: e.target.value }))}
            >
              <option value="">Select gardener</option>
              {gardeners.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={createForm.date}
              onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sage mb-1">Start time</label>
              <select
                className={INPUT_CLS}
                value={createForm.start_time}
                onChange={(e) => {
                  const start = e.target.value;
                  setCreateForm((f) => ({
                    ...f,
                    start_time: start,
                    end_time: start ? addOneHour(start) : f.end_time,
                  }));
                }}
              >
                <option value="">Select</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sage mb-1">End time</label>
              <select
                className={INPUT_CLS}
                value={createForm.end_time}
                onChange={(e) => setCreateForm((f) => ({ ...f, end_time: e.target.value }))}
              >
                <option value="">Select</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={createSubmitting || !createForm.customer_id || !createForm.date}
            className="w-full bg-forest text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 transition-colors mt-2"
          >
            {createSubmitting ? "Creating..." : "Create Service"}
          </button>
        </div>
      </SlideUpModal>

      {/* ===== RESCHEDULE MODAL ===== */}
      <SlideUpModal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Service"
      >
        <div className="space-y-3">
          {rescheduleTarget && (
            <p className="text-xs text-sage">
              {rescheduleTarget.customer_name} &mdash; {rescheduleTarget.scheduled_date}
            </p>
          )}
          <div>
            <label className="block text-xs text-sage mb-1">New date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={rescheduleForm.new_date}
              onChange={(e) =>
                setRescheduleForm((f) => ({ ...f, new_date: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sage mb-1">Start time</label>
              <select
                className={INPUT_CLS}
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
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sage mb-1">End time</label>
              <select
                className={INPUT_CLS}
                value={rescheduleForm.new_end_time}
                onChange={(e) =>
                  setRescheduleForm((f) => ({ ...f, new_end_time: e.target.value }))
                }
              >
                <option value="">Select</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Reason *</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="Why is this being rescheduled?"
              value={rescheduleForm.reason}
              onChange={(e) =>
                setRescheduleForm((f) => ({ ...f, reason: e.target.value }))
              }
            />
          </div>
          <button
            onClick={handleReschedule}
            disabled={rescheduleSubmitting || !rescheduleForm.new_date || !rescheduleForm.reason}
            className="w-full bg-forest text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 transition-colors mt-2"
          >
            {rescheduleSubmitting ? "Rescheduling..." : "Reschedule"}
          </button>
        </div>
      </SlideUpModal>

      {/* ===== CANCEL MODAL ===== */}
      <SlideUpModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Service"
      >
        <div className="space-y-3">
          {cancelTarget && (
            <p className="text-xs text-sage">
              {cancelTarget.customer_name} &mdash; {cancelTarget.scheduled_date}
            </p>
          )}
          <div>
            <label className="block text-xs text-sage mb-1">Reason *</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="Why is this being cancelled?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <button
            onClick={handleCancel}
            disabled={cancelSubmitting || !cancelReason}
            className="w-full bg-terra text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-terra/80 disabled:opacity-50 transition-colors mt-2"
          >
            {cancelSubmitting ? "Cancelling..." : "Cancel Service"}
          </button>
        </div>
      </SlideUpModal>
    </div>
  );
}
