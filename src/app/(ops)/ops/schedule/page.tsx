"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDate } from "@/lib/utils/format-date";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
} from "lucide-react";
import { usePerf } from "@/lib/perf/use-perf";
import ScheduleTodos from "@/components/ops/schedule/ScheduleTodos";
import WeekView from "./WeekView";
import DayView from "./DayView";
import {
  Service,
  OpsEvent,
  DropdownOption,
  DAY_LABELS,
  INPUT_CLS,
  TIME_SLOTS,
  addOneHour,
  fmt,
  getWeekRange,
  formatTime,
  fetcher,
  sortByTime,
  sortEventsByTime,
  SlideUpModal,
} from "./shared";

/* ---------- Helpers ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmt(d);
}

/* ---------- Page (Suspense boundary for useSearchParams) ---------- */

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <ScheduleClient />
    </Suspense>
  );
}

function ScheduleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const perfFetcher = usePerf("/api/ops/schedule/services", "/ops/schedule");

  // ----- View + date from URL (shareable) -----
  const view: "week" | "day" = searchParams.get("view") === "day" ? "day" : "week";
  const dateParam = searchParams.get("date");
  const validDate = dateParam && DATE_RE.test(dateParam) ? dateParam : null;

  const today = fmt(new Date());
  const now = new Date();

  const refDate = useMemo(
    () => (validDate ? new Date(validDate + "T00:00:00") : new Date()),
    [validDate]
  );
  const week = getWeekRange(refDate);
  const dayDate = validDate ?? today;

  const range =
    view === "day"
      ? { from: dayDate, to: dayDate }
      : { from: week.from, to: week.to };

  const currentWeekFrom = getWeekRange(new Date()).from;
  const isCurrentWeek = week.from === currentWeekFrom;
  const weekContainsToday = today >= week.from && today <= week.to;

  // ----- URL writer -----
  function setUrl(next: { view?: "week" | "day" | null; date?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view !== undefined) {
      if (next.view) params.set("view", next.view);
      else params.delete("view");
    }
    if (next.date !== undefined) {
      if (next.date) params.set("date", next.date);
      else params.delete("date");
    }
    const qs = params.toString();
    router.replace(qs ? `/ops/schedule?${qs}` : "/ops/schedule", { scroll: false });
  }

  // Measure the sticky page-header height so the Week day-header row can
  // stick just below it when scrolling.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // SWR: services (keyed off the active range — week range or single day)
  const {
    data: servicesData,
    isLoading: loading,
    mutate,
  } = useSWR(
    `/api/ops/schedule/services?date_from=${range.from}&date_to=${range.to}`,
    perfFetcher
  );
  const services: Service[] = servicesData?.data ?? [];

  // SWR: events (active or all depending on view mode)
  const { data: eventsData, mutate: mutateEvents } = useSWR(
    `/api/ops/events?date_from=${range.from}&date_to=${range.to}&status=all`,
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
    const statusMatch =
      viewMode === "active" ? svc.status !== "cancelled" : svc.status === "cancelled";
    const gardenerMatch =
      !gardenerFilter || (svc.gardener_ids ?? []).includes(gardenerFilter);
    return statusMatch && gardenerMatch;
  });

  // Filter events by view mode (events are not filtered by gardener)
  const filteredEvents = allEvents.filter((evt) =>
    viewMode === "active" ? evt.status === "active" : evt.status === "cancelled"
  );

  // Group services / events by date and sort by time (for Week view)
  const byDate: Record<string, Service[]> = {};
  for (const svc of filteredServices) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
  }
  for (const key of Object.keys(byDate)) byDate[key].sort(sortByTime);

  const eventsByDate: Record<string, OpsEvent[]> = {};
  for (const evt of filteredEvents) {
    if (!eventsByDate[evt.event_date]) eventsByDate[evt.event_date] = [];
    eventsByDate[evt.event_date].push(evt);
  }
  for (const key of Object.keys(eventsByDate)) eventsByDate[key].sort(sortEventsByTime);

  // Generate all 7 days of the week
  const weekDays: { date: string; label: string; dayLabel: string }[] = [];
  const monday = new Date(week.from + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push({ date: fmt(d), label: `${d.getDate()}`, dayLabel: DAY_LABELS[i] });
  }

  // Day-view header label
  const dayObj = new Date(dayDate + "T00:00:00");
  const dayLabel = `${dayObj.toLocaleString("en-IN", { weekday: "long" })}, ${dayObj.getDate()} ${dayObj.toLocaleString("en-IN", { month: "long" })}`;

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

  const serviceActions = { onReschedule: openReschedule, onCancel: openCancel };
  const eventActions = {
    onView: setViewEventTarget,
    onReschedule: openRescheduleEvent,
    onCancel: openCancelEvent,
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div ref={headerRef} className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <h1
            className="text-2xl text-charcoal"
            style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
          >
            Schedule
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/schedule/reminders"
              aria-label="Reminders"
              title="Reminders"
              className="flex items-center gap-1.5 border border-stone text-charcoal text-sm px-3 py-2 rounded-xl hover:bg-cream transition-colors whitespace-nowrap"
            >
              <MessageSquare size={16} />
              <span className="hidden sm:inline">Reminders</span>
            </Link>
            <button
              onClick={() => setEventCreateOpen(true)}
              className="flex items-center gap-1.5 border border-stone text-charcoal text-sm px-3 py-2 rounded-xl hover:bg-cream transition-colors whitespace-nowrap"
            >
              <Plus size={16} />
              New Event
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 bg-forest text-offwhite text-sm px-3 py-2 rounded-xl hover:bg-garden transition-colors whitespace-nowrap"
            >
              <Plus size={16} />
              New Service
            </button>
          </div>
        </div>

        {/* Day / Week toggle + period navigation */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-1 bg-cream rounded-xl p-0.5">
            <button
              onClick={() => setUrl({ view: "week" })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                view === "week"
                  ? "bg-offwhite text-charcoal shadow-sm"
                  : "text-sage hover:text-charcoal"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setUrl({ view: "day", date: dayDate })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                view === "day"
                  ? "bg-offwhite text-charcoal shadow-sm"
                  : "text-sage hover:text-charcoal"
              }`}
            >
              Day
            </button>
          </div>

          {view === "week" ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setUrl({ view: "week", date: addDays(week.from, -7) })}
                className="p-1 text-charcoal hover:text-forest"
                aria-label="Previous week"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center min-w-[150px]">
                <p className="text-sm font-medium text-charcoal">{week.label}</p>
                {!isCurrentWeek && (
                  <button
                    onClick={() => setUrl({ view: "week", date: null })}
                    className="text-xs text-forest hover:text-garden"
                  >
                    Jump to today
                  </button>
                )}
              </div>
              <button
                onClick={() => setUrl({ view: "week", date: addDays(week.from, 7) })}
                className="p-1 text-charcoal hover:text-forest"
                aria-label="Next week"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setUrl({ view: "day", date: addDays(dayDate, -1) })}
                className="p-1 text-charcoal hover:text-forest"
                aria-label="Previous day"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center min-w-[150px]">
                <p className="text-sm font-medium text-charcoal">
                  {dayDate === today ? `Today · ${dayLabel}` : dayLabel}
                </p>
                {dayDate !== today && (
                  <button
                    onClick={() => setUrl({ view: "day", date: today })}
                    className="text-xs text-forest hover:text-garden"
                  >
                    Today
                  </button>
                )}
              </div>
              <button
                onClick={() => setUrl({ view: "day", date: addDays(dayDate, 1) })}
                className="p-1 text-charcoal hover:text-forest"
                aria-label="Next day"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>

        {/* View mode tabs + gardener filter */}
        <div className="flex items-center justify-between gap-3">
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
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Shared ops to-do list — pinned above the grid */}
      <ScheduleTodos />

      {/* View body */}
      <div className="px-4 pt-4">
        {view === "week" ? (
          <WeekView
            weekDays={weekDays}
            byDate={byDate}
            eventsByDate={eventsByDate}
            today={today}
            now={now}
            viewMode={viewMode}
            loading={loading}
            weekKey={week.from}
            weekContainsToday={weekContainsToday}
            headerOffset={headerH}
            serviceActions={serviceActions}
            eventActions={eventActions}
            onDayHeader={(date) => setUrl({ view: "day", date })}
          />
        ) : (
          <DayView
            services={filteredServices}
            events={filteredEvents}
            date={dayDate}
            today={today}
            now={now}
            viewMode={viewMode}
            loading={loading}
            serviceActions={serviceActions}
            eventActions={eventActions}
          />
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
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  gardener_id: e.target.value,
                  additional_gardener_ids: f.additional_gardener_ids.filter((id) => id !== e.target.value),
                }))
              }
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
                        onClick={() =>
                          setCreateForm((f) => ({
                            ...f,
                            additional_gardener_ids: f.additional_gardener_ids.filter((id) => id !== gid),
                          }))
                        }
                        className="text-stone hover:text-terra"
                      >
                        ×
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
              onChange={(e) => setRescheduleForm((f) => ({ ...f, new_date: e.target.value }))}
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-sage mb-1">End time</label>
              <select
                className={INPUT_CLS}
                value={rescheduleForm.new_end_time}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, new_end_time: e.target.value }))}
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
            <label className="block text-xs text-sage mb-1">Reason *</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="Why is this being rescheduled?"
              value={rescheduleForm.reason}
              onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))}
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
      <SlideUpModal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Service">
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
      <SlideUpModal open={!!cancelEventTarget} onClose={() => setCancelEventTarget(null)} title="Cancel Event">
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
      <SlideUpModal open={!!viewEventTarget} onClose={() => setViewEventTarget(null)} title="Event Details">
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
