"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_CLS: Record<string, string> = {
  scheduled: "border-l-forest/40",
  in_progress: "border-l-forest",
  completed: "border-l-sage",
  not_completed: "border-l-terra",
  missed: "border-l-terra",
  cancelled: "border-l-stone",
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-forest/40",
  in_progress: "bg-forest",
  completed: "bg-sage",
  not_completed: "bg-terra",
  missed: "bg-terra",
  cancelled: "bg-stone",
};

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

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const week = getWeekRange(baseDate);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/ops/schedule/services?date_from=${week.from}&date_to=${week.to}`
    );
    const json = await res.json();
    setServices(json.data ?? []);
    setLoading(false);
  }, [week.from, week.to]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by date
  const byDate: Record<string, Service[]> = {};
  for (const svc of services) {
    if (!byDate[svc.scheduled_date]) byDate[svc.scheduled_date] = [];
    byDate[svc.scheduled_date].push(svc);
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

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <div className="bg-offwhite border-b border-stone px-4 pt-6 pb-4 sticky top-0 z-10">
        <h1
          className="text-2xl text-charcoal mb-3"
          style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
        >
          Schedule
        </h1>

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
          <p className="text-sm text-sage text-center py-10">Loading…</p>
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
                    <p className="text-[10px] text-stone text-center pt-4">—</p>
                  ) : (
                    dayServices.map((svc) => (
                      <div
                        key={svc.id}
                        className={`rounded-lg border-l-2 px-2 py-1.5 text-[11px] ${
                          STATUS_CLS[svc.status] ?? "border-l-stone"
                        } bg-cream/50`}
                      >
                        <p className="font-medium text-charcoal truncate">
                          {svc.customer_name}
                        </p>
                        <p className="text-sage truncate">
                          {svc.time_window_start ?? ""}{" "}
                          {svc.gardener_name ? `· ${svc.gardener_name}` : ""}
                        </p>
                      </div>
                    ))
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
          <p className="text-sm text-sage text-center py-10">Loading…</p>
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
                    {dayServices.map((svc) => (
                      <div
                        key={svc.id}
                        className={`bg-offwhite rounded-xl border border-stone/60 border-l-4 px-3 py-2.5 ${
                          STATUS_CLS[svc.status] ?? "border-l-stone"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-charcoal">
                            {svc.customer_name}
                          </p>
                          <div className="flex items-center gap-1.5">
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
                          {svc.gardener_name && (
                            <span>{svc.gardener_name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
