"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Calendar, MoreVertical, X } from "lucide-react";

/* ============================================================
 * Shared types, constants, helpers, and presentational pieces
 * for the Schedule Week + Day views. Single source of truth for
 * status colours, time helpers, and the per-visit/per-event pills.
 * ============================================================ */

/* ---------- Types ---------- */

export type Service = {
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
  started_at: string | null;
  completed_at: string | null;
  visit_duration_minutes: number | null;
};

export type OpsEvent = {
  id: string;
  title: string;
  event_date: string;
  time_start: string | null;
  time_end: string | null;
  notes: string | null;
  status: string;
};

export type DropdownOption = { id: string; name: string };

/* ---------- Constants ---------- */

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const INPUT_CLS =
  "w-full px-3 py-2.5 border border-stone rounded-xl text-sm text-charcoal bg-offwhite focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest placeholder:text-stone";

export const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-forest/70",
  in_progress: "bg-forest",
  completed: "bg-sage",
  not_completed: "bg-terra",
  missed: "bg-terra",
  cancelled: "bg-stone",
};

/** Generate 30-min time slots from 07:00 to 19:00 for select dropdowns */
export const TIME_SLOTS: { value: string; label: string }[] = (() => {
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
export function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 19);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ---------- Date / time helpers ---------- */

export function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getWeekRange(date: Date): { from: string; to: string; label: string } {
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

/** Build a full datetime from a date string and HH:MM(:SS) time string */
export function toDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

/** Minutes since midnight for a "HH:MM" or "HH:MM:SS" string; null when unparseable. */
export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Whole-minute difference (later − earlier) between two ISO timestamps. */
export function diffMinutes(laterIso: string, earlierIso: string): number {
  return Math.round((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 60000);
}

/** Format a HH:MM(:SS) time string to 12-hour format */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ---------- Time band (Week view) ---------- */

export type Band = "morning" | "afternoon" | "evening";

/** Morning 8–12, Afternoon 12–3, Evening 3–6 (≥ 15:00). Null start = no band. */
export function getBand(start: string | null): Band | null {
  const mins = timeToMinutes(start);
  if (mins === null) return null;
  if (mins < 12 * 60) return "morning";
  if (mins < 15 * 60) return "afternoon";
  return "evening";
}

/* ---------- Derived service state ---------- */

/** A scheduled visit is past due when the clock is past its window end. */
export function isPastDue(svc: Service, now: Date): boolean {
  if (svc.status !== "scheduled") return false;
  if (svc.time_window_end && svc.scheduled_date) {
    return now > toDateTime(svc.scheduled_date, svc.time_window_end);
  }
  return false;
}

/** "Needs attention" = past due, not completed, or missed. */
export function needsAttention(svc: Service, now: Date): boolean {
  if (svc.status === "not_completed" || svc.status === "missed") return true;
  return isPastDue(svc, now);
}

/** Resolve a block's duration in minutes for the Day view (precedence per PRD §8.3). */
export function blockDurationMinutes(svc: Service, now: Date): number {
  // 1. Completed with both timestamps → actual duration.
  if (svc.started_at && svc.completed_at) {
    return Math.max(diffMinutes(svc.completed_at, svc.started_at), 0);
  }
  // 2. In progress → started → now (grows live).
  if (svc.started_at && !svc.completed_at && svc.status === "in_progress") {
    return Math.max(diffMinutes(now.toISOString(), svc.started_at), 0);
  }
  // 3 & fallback. Plan visit duration (default 60).
  return svc.visit_duration_minutes ?? 60;
}

/** Returns Tailwind classes for a service pill based on status + time windows */
export function getServiceStatusColor(svc: Service, now: Date): string {
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
export function getStatusLabel(svc: Service, now: Date): { text: string; cls: string } {
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
export function sortByTime(a: Service, b: Service): number {
  if (a.time_window_start === b.time_window_start) return 0;
  if (a.time_window_start === null) return 1;
  if (b.time_window_start === null) return -1;
  return a.time_window_start.localeCompare(b.time_window_start);
}

/** Sort events by time_start ascending; null times go last */
export function sortEventsByTime(a: OpsEvent, b: OpsEvent): number {
  if (a.time_start === b.time_start) return 0;
  if (a.time_start === null) return 1;
  if (b.time_start === null) return -1;
  return a.time_start.localeCompare(b.time_start);
}

/** Returns the correct link href for a service based on its status.
 *  Schedule page is admin/horti only — always link to the service detail view. */
export function getServiceHref(svc: Service): string | null {
  if (svc.status === "cancelled") return null;
  return `/ops/services/${svc.id}`;
}

/* ---------- SWR fetcher ---------- */

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ---------- Slide-up modal shell ---------- */

export function SlideUpModal({
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

export function PillDropdown({
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

export function EventPillDropdown({
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

/* ---------- Service pill (Week grid + mobile list + Day agenda) ---------- */

export type ServiceActionProps = {
  viewMode: "active" | "cancelled";
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
};

export function ServicePill({
  svc,
  now,
  variant,
  viewMode,
  onReschedule,
  onCancel,
}: {
  svc: Service;
  now: Date;
  variant: "desktop" | "mobile";
  } & ServiceActionProps) {
  const colorCls = getServiceStatusColor(svc, now);
  const href = getServiceHref(svc);

  if (variant === "desktop") {
    const label = getStatusLabel(svc, now);
    const inner = (
      <>
        <div className="flex items-start justify-between gap-1">
          <p className="font-medium text-charcoal text-sm leading-tight break-words">
            {svc.time_window_start ? `${formatTime(svc.time_window_start)} · ` : ""}
            {svc.customer_name}
          </p>
          {viewMode === "active" && (
            <PillDropdown svc={svc} onReschedule={onReschedule} onCancel={onCancel} />
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-charcoal/60 truncate text-xs">
            {svc.gardener_name ?? ""}
          </p>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${label.cls}`}
          >
            {label.text}
          </span>
        </div>
      </>
    );

    if (href && viewMode === "active") {
      return (
        <Link
          href={href}
          className={`block rounded-lg border-l-[3px] px-2.5 py-2 ${colorCls} hover:shadow-sm transition-shadow`}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div className={`rounded-lg border-l-[3px] px-2.5 py-2 ${colorCls} cursor-default`}>
        {inner}
      </div>
    );
  }

  // mobile
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-charcoal">{svc.customer_name}</p>
        <div className="flex items-center gap-1.5">
          {viewMode === "active" && (
            <PillDropdown svc={svc} onReschedule={onReschedule} onCancel={onCancel} />
          )}
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[svc.status] ?? "bg-stone"}`} />
          <span className="text-xs text-sage capitalize">
            {svc.status.replace("_", " ")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-sage mt-0.5">
        {svc.time_window_start && (
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {svc.time_window_start}
            {svc.time_window_end ? ` – ${svc.time_window_end}` : ""}
          </span>
        )}
        {svc.gardener_name && <span>{svc.gardener_name}</span>}
      </div>
    </>
  );

  if (href && viewMode === "active") {
    return (
      <Link
        href={href}
        className={`block bg-offwhite rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${colorCls} hover:shadow-sm transition-shadow`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      className={`bg-offwhite rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${colorCls} cursor-default`}
    >
      {inner}
    </div>
  );
}

/* ---------- Event pill (Week grid + mobile list + Day agenda) ---------- */

export type EventActionProps = {
  viewMode: "active" | "cancelled";
  onView: (event: OpsEvent) => void;
  onReschedule: (event: OpsEvent) => void;
  onCancel: (event: OpsEvent) => void;
};

export function EventPill({
  event,
  variant,
  viewMode,
  onView,
  onReschedule,
  onCancel,
}: {
  event: OpsEvent;
  variant: "desktop" | "mobile";
} & EventActionProps) {
  const isCancelled = event.status === "cancelled";

  if (variant === "desktop") {
    return (
      <div
        className={`rounded-lg border-l-[3px] px-2.5 py-2 ${
          isCancelled
            ? "bg-stone/10 border-l-stone opacity-60 cursor-default"
            : "bg-indigo-50 border-l-indigo-500 cursor-pointer hover:shadow-sm transition-shadow"
        }`}
        onClick={() => !isCancelled && onView(event)}
      >
        <div className="flex items-center justify-between gap-1">
          <p
            className={`font-medium truncate text-sm ${
              isCancelled ? "text-stone line-through" : "text-charcoal"
            }`}
          >
            {event.title}
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap bg-indigo-100 text-indigo-700">
              Event
            </span>
            {viewMode === "active" && (
              <EventPillDropdown
                event={event}
                onView={onView}
                onReschedule={onReschedule}
                onCancel={onCancel}
              />
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

  // mobile
  return (
    <div
      className={`rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${
        isCancelled
          ? "bg-stone/10 border-l-stone opacity-60 cursor-default"
          : "bg-indigo-50 border-l-indigo-500 cursor-pointer hover:shadow-sm transition-shadow"
      }`}
      onClick={() => !isCancelled && onView(event)}
    >
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${isCancelled ? "text-stone line-through" : "text-charcoal"}`}>
          {event.title}
        </p>
        <div className="flex items-center gap-1.5">
          {viewMode === "active" && (
            <EventPillDropdown
              event={event}
              onView={onView}
              onReschedule={onReschedule}
              onCancel={onCancel}
            />
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
