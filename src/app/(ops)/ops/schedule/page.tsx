"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDate } from "@/lib/utils/format-date";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  MoreVertical,
  X,
} from "lucide-react";
import { usePerf } from "@/lib/perf/use-perf";

/* ---------- Types ---------- */

type Service = {
  id: string;
  customer_id: string;
  customer_name: string;
  gardener_name: string | null;
  assigned_gardener_id: string | null;
  gardener_ids: string[];
  scheduled_date: string;
  time_window_start: string | null;
  time_window_end: string | null;
  status: string;
};

type OpsEvent = {
  id: string;
  title: string;
  event_date: string;
  time_start: string | null;
  time_end: string | null;
  notes: string | null;
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
    label: `${monday.getDate()} ${monday.toLocaleString("en-IN", { month: "long" })} – ${sunday.getDate()} ${sunday.toLocaleString("en-IN", { month: "long" })} ${sunday.getFullYear()}`,
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

/** Sort events by time_start ascending; null times go last */
function sortEventsByTime(a: OpsEvent, b: OpsEvent): number {
  if (a.time_start === b.time_start) return 0;
  if (a.time_start === null) return 1;
  if (b.time_start === null) return -1;
  return a.time_start.localeCompare(b.time_start);
}

/** Returns the correct link href for a service based on its status.
 *  Schedule page is admin/horti only — always link to the service detail view. */
function getServiceHref(svc: Service): string | null {
  if (svc.status === "cancelled") return null;
  return `/ops/services/${svc.id}`;
}

/** Format a HH:MM time string to 12-hour format */
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
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

/* ---------- Three-dot dropdown on an event pill ---------- */

function EventPillDropdown({
  event,
  onView,
  onReschedule,
  onCancel,
}: {
  event: OpsEvent;
  onView: (event: OpsEvent) => void;
  onReschedule: (event: OpsEvent) => void;
  onCancel: (event: OpsEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (event.status !== "active") return null;

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
              onView(event);
            }}
          >
            View Details
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-charcoal hover:bg-cream"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onReschedule(event);
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
              onCancel(event);
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
  const perfFetcher = usePerf('/api/ops/schedule/services', '/ops/schedule');
  const [weekOffset, setWeekOffset] = useState(0);

  // View mode: active or cancelled
  const [viewMode, setViewMode] = useState<"active" | "cancelled">("active");

  // Gardener filter
  const [gardenerFilter, setGardenerFilter] = useState<string>("");

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [eventCreateOpen, setEventCreateOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Service | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Service | null>(null);
  const [cancelEventTarget, setCancelEventTarget] = useState<OpsEvent | null>(null);
  const [viewEventTarget, setViewEventTarget] = useState<OpsEvent | null>(null);
  const [rescheduleEventTarget, setRescheduleEventTarget] = useState<OpsEvent | null>(null);

  // Form state — create service
  const [createForm, setCreateForm] = useState({
    customer_id: "",
    gardener_id: "",
    additional_gardener_ids: [] as string[],
    date: "",
    start_time: "",
    end_time: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form state — create event
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    start_time: "",
    end_time: "",
    notes: "",
  });
  const [eventSubmitting, setEventSubmitting] = useState(false);

  // Form state — reschedule
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: "",
    new_start_time: "",
    new_end_time: "",
    reason: "",
  });
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  // Form state — cancel service
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Form state — cancel event
  const [cancelEventReason, setCancelEventReason] = useState("");
  const [cancelEventSubmitting, setCancelEventSubmitting] = useState(false);

  // Form state — reschedule event
  const [rescheduleEventForm, setRescheduleEventForm] = useState({
    new_date: "",
    new_start_time: "",
    new_end_time: "",
  });
  const [rescheduleEventSubmitting, setRescheduleEventSubmitting] = useState(false);

  // Week calculation
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const week = getWeekRange(baseDate);

  // SWR: services
  const {
    data: servicesData,
    isLoading: loading,
    mutate,
  } = useSWR(`/api/ops/schedule/services?date_from=${week.from}&date_to=${week.to}`, perfFetcher);
  const services: Service[] = servicesData?.data ?? [];

  // SWR: events (active or all depending on view mode)
  const { data: eventsData, mutate: mutateEvents } = useSWR(
    `/api/ops/events?date_from=${week.from}&date_to=${week.to}&status=all`,
    fetcher
  );
  const allEvents: OpsEvent[] = eventsData?.data ?? [];

  // SWR: customers (for create modal — only fetch when modal is open)
  const { data: customersData } = useSWR(
    createOpen ? "/api/ops/customers?status=ACTIVE" : null,
    fetcher
  );
  // SWR: gardeners (always fetch for filter dropdown)
  const { data: gardenersData } = useSWR("/api/ops/gardeners", fetcher);
  const customers: DropdownOption[] = (customersData?.data ?? []).map(
    (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
  );
  const gardeners: DropdownOption[] = (gardenersData?.data ?? []).map(
    (g: { id: string; name: string }) => ({ id: g.id, name: g.name })
  );

  // Filter services by view mode and gardener
  const filteredServices = services.filter((svc) => {
    const statusMatch = viewMode === "active"
      ? svc.status !== "cancelled"
      : svc.status === "cancelled";
    const gardenerMatch = !gardenerFilter || (svc.gardener_ids ?? []).includes(gardenerFilter);
    return statusMatch && gardenerMatch;
  });

  // Filter events by view mode (events are not filtered by gardener)
  const filteredEvents = allEvents.filter((evt) =>
    viewMode === "active" ? evt.status === "active" : evt.status === "cancelled"
  );

  // Group services by date and sort by time
  const byDate: Record<string, Service[]> = {};
  for (const svc of filteredServices) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
  }
  for (const key of Object.keys(byDate)) {
    byDate[key].sort(sortByTime);
  }

  // Group events by date and sort by time
  const eventsByDate: Record<string, OpsEvent[]> = {};
  for (const evt of filteredEvents) {
    if (!eventsByDate[evt.event_date]) eventsByDate[evt.event_date] = [];
    eventsByDate[evt.event_date].push(evt);
  }
  for (const key of Object.keys(eventsByDate)) {
    eventsByDate[key].sort(sortEventsByTime);
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
          additional_gardener_ids: createForm.additional_gardener_ids,
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
      setCreateForm({ customer_id: "", gardener_id: "", additional_gardener_ids: [], date: "", start_time: "", end_time: "" });
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleEventCreate() {
    setEventSubmitting(true);
    try {
      const res = await fetch("/api/ops/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventForm.title,
          event_date: eventForm.date,
          time_start: eventForm.start_time || null,
          time_end: eventForm.end_time || null,
          notes: eventForm.notes || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to create event");
        return;
      }
      mutateEvents();
      setEventCreateOpen(false);
      setEventForm({ title: "", date: "", start_time: "", end_time: "", notes: "" });
    } finally {
      setEventSubmitting(false);
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

  async function handleCancelEvent() {
    if (!cancelEventTarget) return;
    setCancelEventSubmitting(true);
    try {
      const res = await fetch(`/api/ops/events/${cancelEventTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelEventReason }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to cancel event");
        return;
      }
      mutateEvents();
      setCancelEventTarget(null);
      setCancelEventReason("");
    } finally {
      setCancelEventSubmitting(false);
    }
  }

  async function handleRescheduleEvent() {
    if (!rescheduleEventTarget) return;
    setRescheduleEventSubmitting(true);
    try {
      const updates: Record<string, string | null> = {
        event_date: rescheduleEventForm.new_date,
      };
      if (rescheduleEventForm.new_start_time) updates.time_start = rescheduleEventForm.new_start_time;
      if (rescheduleEventForm.new_end_time) updates.time_end = rescheduleEventForm.new_end_time;

      const res = await fetch(`/api/ops/events/${rescheduleEventTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to reschedule event");
        return;
      }
      mutateEvents();
      setRescheduleEventTarget(null);
    } finally {
      setRescheduleEventSubmitting(false);
    }
  }

  function openRescheduleEvent(event: OpsEvent) {
    setRescheduleEventForm({
      new_date: event.event_date,
      new_start_time: event.time_start?.slice(0, 5) ?? "",
      new_end_time: event.time_end?.slice(0, 5) ?? "",
    });
    setRescheduleEventTarget(event);
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

  function openCancelEvent(event: OpsEvent) {
    setCancelEventReason("");
    setCancelEventTarget(event);
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
          {viewMode === "active" && (
            <PillDropdown svc={svc} onReschedule={openReschedule} onCancel={openCancel} />
          )}
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

    if (href && viewMode === "active") {
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
            {viewMode === "active" && (
              <PillDropdown svc={svc} onReschedule={openReschedule} onCancel={openCancel} />
            )}
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

    if (href && viewMode === "active") {
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

  function renderDesktopEventPill(event: OpsEvent) {
    const isCancelled = event.status === "cancelled";

    return (
      <div
        key={`event-${event.id}`}
        className={`rounded-lg border-l-[3px] px-2.5 py-2 ${
          isCancelled
            ? "bg-stone/10 border-l-stone opacity-60 cursor-default"
            : "bg-indigo-50 border-l-indigo-500 cursor-pointer hover:shadow-sm transition-shadow"
        }`}
        onClick={() => !isCancelled && setViewEventTarget(event)}
      >
        <div className="flex items-center justify-between gap-1">
          <p className={`font-medium truncate text-sm ${isCancelled ? "text-stone line-through" : "text-charcoal"}`}>
            {event.title}
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap bg-indigo-100 text-indigo-700">
              Event
            </span>
            {viewMode === "active" && (
              <EventPillDropdown event={event} onView={setViewEventTarget} onReschedule={openRescheduleEvent} onCancel={openCancelEvent} />
            )}
          </div>
        </div>
        {event.time_start && (
          <p className="text-charcoal/60 truncate text-xs mt-0.5">
            {formatTime(event.time_start)}
            {event.time_end ? ` – ${formatTime(event.time_end)}` : ""}
          </p>
        )}
      </div>
    );
  }

  function renderMobileEventPill(event: OpsEvent) {
    const isCancelled = event.status === "cancelled";

    return (
      <div
        key={`event-${event.id}`}
        className={`rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${
          isCancelled
            ? "bg-stone/10 border-l-stone opacity-60 cursor-default"
            : "bg-indigo-50 border-l-indigo-500 cursor-pointer hover:shadow-sm transition-shadow"
        }`}
        onClick={() => !isCancelled && setViewEventTarget(event)}
      >
        <div className="flex items-center justify-between">
          <p className={`text-sm font-medium ${isCancelled ? "text-stone line-through" : "text-charcoal"}`}>
            {event.title}
          </p>
          <div className="flex items-center gap-1.5">
            {viewMode === "active" && (
              <EventPillDropdown event={event} onView={setViewEventTarget} onReschedule={openRescheduleEvent} onCancel={openCancelEvent} />
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
              Event
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-sage mt-0.5">
          {event.time_start && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {formatTime(event.time_start)}
              {event.time_end ? ` – ${formatTime(event.time_end)}` : ""}
            </span>
          )}
        </div>
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEventCreateOpen(true)}
              className="flex items-center gap-1.5 border border-stone text-charcoal text-sm px-3 py-2 rounded-xl hover:bg-cream transition-colors"
            >
              <Plus size={16} />
              New Event
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 bg-forest text-offwhite text-sm px-3 py-2 rounded-xl hover:bg-garden transition-colors"
            >
              <Plus size={16} />
              New Service
            </button>
          </div>
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

        {/* View mode tabs + gardener filter */}
        <div className="flex items-center justify-between mt-3 gap-3">
          <div className="flex items-center gap-1 bg-cream rounded-xl p-0.5">
            <button
              onClick={() => setViewMode("active")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === "active"
                  ? "bg-offwhite text-charcoal shadow-sm"
                  : "text-sage hover:text-charcoal"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setViewMode("cancelled")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === "cancelled"
                  ? "bg-offwhite text-charcoal shadow-sm"
                  : "text-sage hover:text-charcoal"
              }`}
            >
              Cancelled
            </button>
          </div>
          <select
            value={gardenerFilter}
            onChange={(e) => setGardenerFilter(e.target.value)}
            className={INPUT_CLS + " max-w-[200px]"}
          >
            <option value="">All Gardeners</option>
            {gardeners.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
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
              const dayEvents = eventsByDate[day.date] ?? [];
              const hasContent = dayServices.length > 0 || dayEvents.length > 0;
              return (
                <div
                  key={day.date}
                  className="bg-offwhite border border-stone/40 rounded-b-xl p-1.5 min-h-[120px] space-y-1"
                >
                  {!hasContent ? (
                    <p className="text-[10px] text-stone text-center pt-4">&mdash;</p>
                  ) : (
                    <>
                      {dayServices.map((svc) => renderDesktopPill(svc))}
                      {dayEvents.map((evt) => renderDesktopEventPill(evt))}
                    </>
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
            const dayEvents = eventsByDate[day.date] ?? [];
            const isToday = day.date === today;
            const totalItems = dayServices.length + dayEvents.length;

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
                    {totalItems > 0
                      ? `${totalItems} item${totalItems !== 1 ? "s" : ""}`
                      : ""}
                  </span>
                </div>

                {totalItems === 0 ? (
                  <div className="bg-offwhite rounded-xl border border-stone/40 px-4 py-3 text-xs text-stone">
                    {viewMode === "cancelled" ? "No cancelled items" : "No visits"}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {dayServices.map((svc) => renderMobilePill(svc))}
                    {dayEvents.map((evt) => renderMobileEventPill(evt))}
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
            <label className="block text-xs text-sage mb-1">Primary Gardener</label>
            <select
              className={INPUT_CLS}
              value={createForm.gardener_id}
              onChange={(e) => setCreateForm((f) => ({
                ...f,
                gardener_id: e.target.value,
                additional_gardener_ids: f.additional_gardener_ids.filter((id) => id !== e.target.value),
              }))}
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
            <label className="block text-xs text-sage mb-1">Additional Gardeners</label>
            {createForm.additional_gardener_ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {createForm.additional_gardener_ids.map((gid) => {
                  const g = gardeners.find((g) => g.id === gid);
                  return (
                    <span key={gid} className="inline-flex items-center gap-1 bg-cream text-charcoal text-xs px-2.5 py-1 rounded-full">
                      {g?.name ?? "Unknown"}
                      <button
                        type="button"
                        onClick={() => setCreateForm((f) => ({
                          ...f,
                          additional_gardener_ids: f.additional_gardener_ids.filter((id) => id !== gid),
                        }))}
                        className="text-stone hover:text-terra"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              className={INPUT_CLS}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setCreateForm((f) => ({
                  ...f,
                  additional_gardener_ids: [...f.additional_gardener_ids, e.target.value],
                }));
              }}
            >
              <option value="">Add gardener…</option>
              {gardeners
                .filter((g) => g.id !== createForm.gardener_id && !createForm.additional_gardener_ids.includes(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
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

      {/* ===== CREATE EVENT MODAL ===== */}
      <SlideUpModal open={eventCreateOpen} onClose={() => setEventCreateOpen(false)} title="New Event">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sage mb-1">Title *</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="e.g. Team meeting, Holiday"
              value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={eventForm.date}
              onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sage mb-1">Start time</label>
              <select
                className={INPUT_CLS}
                value={eventForm.start_time}
                onChange={(e) => {
                  const start = e.target.value;
                  setEventForm((f) => ({
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
                value={eventForm.end_time}
                onChange={(e) => setEventForm((f) => ({ ...f, end_time: e.target.value }))}
              >
                <option value="">Select</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-sage mb-1">Notes</label>
            <textarea
              className={INPUT_CLS + " resize-none"}
              rows={3}
              placeholder="Optional notes..."
              value={eventForm.notes}
              onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <button
            onClick={handleEventCreate}
            disabled={eventSubmitting || !eventForm.title || !eventForm.date}
            className="w-full bg-forest text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 transition-colors mt-2"
          >
            {eventSubmitting ? "Creating..." : "Create Event"}
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
              {rescheduleTarget.customer_name} &mdash; {formatDate(rescheduleTarget.scheduled_date)}
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

      {/* ===== CANCEL SERVICE MODAL ===== */}
      <SlideUpModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Service"
      >
        <div className="space-y-3">
          {cancelTarget && (
            <p className="text-xs text-sage">
              {cancelTarget.customer_name} &mdash; {formatDate(cancelTarget.scheduled_date)}
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

      {/* ===== CANCEL EVENT MODAL ===== */}
      <SlideUpModal
        open={!!cancelEventTarget}
        onClose={() => setCancelEventTarget(null)}
        title="Cancel Event"
      >
        <div className="space-y-3">
          {cancelEventTarget && (
            <p className="text-xs text-sage">
              {cancelEventTarget.title} &mdash; {formatDate(cancelEventTarget.event_date)}
            </p>
          )}
          <div>
            <label className="block text-xs text-sage mb-1">Reason</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="Why is this being cancelled?"
              value={cancelEventReason}
              onChange={(e) => setCancelEventReason(e.target.value)}
            />
          </div>
          <button
            onClick={handleCancelEvent}
            disabled={cancelEventSubmitting}
            className="w-full bg-terra text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-terra/80 disabled:opacity-50 transition-colors mt-2"
          >
            {cancelEventSubmitting ? "Cancelling..." : "Cancel Event"}
          </button>
        </div>
      </SlideUpModal>

      {/* ===== VIEW EVENT DETAILS MODAL ===== */}
      <SlideUpModal
        open={!!viewEventTarget}
        onClose={() => setViewEventTarget(null)}
        title="Event Details"
      >
        {viewEventTarget && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-sage mb-0.5">Title</p>
              <p className="text-sm font-medium text-charcoal">{viewEventTarget.title}</p>
            </div>
            <div>
              <p className="text-xs text-sage mb-0.5">Date</p>
              <p className="text-sm text-charcoal">{formatDate(viewEventTarget.event_date)}</p>
            </div>
            {viewEventTarget.time_start && (
              <div>
                <p className="text-xs text-sage mb-0.5">Time</p>
                <p className="text-sm text-charcoal">
                  {formatTime(viewEventTarget.time_start)}
                  {viewEventTarget.time_end ? ` – ${formatTime(viewEventTarget.time_end)}` : ""}
                </p>
              </div>
            )}
            {viewEventTarget.notes && (
              <div>
                <p className="text-xs text-sage mb-0.5">Notes</p>
                <p className="text-sm text-charcoal whitespace-pre-wrap">{viewEventTarget.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  const evt = viewEventTarget;
                  setViewEventTarget(null);
                  openRescheduleEvent(evt);
                }}
                className="flex-1 py-2.5 border border-stone rounded-xl text-sm text-charcoal hover:bg-cream"
              >
                Reschedule
              </button>
              <button
                onClick={() => {
                  const evt = viewEventTarget;
                  setViewEventTarget(null);
                  openCancelEvent(evt);
                }}
                className="flex-1 py-2.5 border border-terra/40 rounded-xl text-sm text-terra hover:bg-terra/5"
              >
                Cancel Event
              </button>
            </div>
          </div>
        )}
      </SlideUpModal>

      {/* ===== RESCHEDULE EVENT MODAL ===== */}
      <SlideUpModal
        open={!!rescheduleEventTarget}
        onClose={() => setRescheduleEventTarget(null)}
        title="Reschedule Event"
      >
        <div className="space-y-3">
          {rescheduleEventTarget && (
            <p className="text-xs text-sage">
              {rescheduleEventTarget.title} &mdash; {formatDate(rescheduleEventTarget.event_date)}
            </p>
          )}
          <div>
            <label className="block text-xs text-sage mb-1">New date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={rescheduleEventForm.new_date}
              onChange={(e) => setRescheduleEventForm((f) => ({ ...f, new_date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sage mb-1">Start time</label>
              <select
                className={INPUT_CLS}
                value={rescheduleEventForm.new_start_time}
                onChange={(e) => {
                  const start = e.target.value;
                  setRescheduleEventForm((f) => ({
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
                value={rescheduleEventForm.new_end_time}
                onChange={(e) => setRescheduleEventForm((f) => ({ ...f, new_end_time: e.target.value }))}
              >
                <option value="">Select</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleRescheduleEvent}
            disabled={rescheduleEventSubmitting || !rescheduleEventForm.new_date}
            className="w-full bg-forest text-offwhite py-2.5 rounded-xl text-sm font-medium hover:bg-garden disabled:opacity-50 transition-colors mt-2"
          >
            {rescheduleEventSubmitting ? "Rescheduling..." : "Reschedule"}
          </button>
        </div>
      </SlideUpModal>
    </div>
  );
}
