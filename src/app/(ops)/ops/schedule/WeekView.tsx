"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Service,
  OpsEvent,
  Band,
  getBand,
  needsAttention,
  sortByTime,
  sortEventsByTime,
  ServicePill,
  EventPill,
  ServiceActionProps,
  EventActionProps,
} from "./shared";

type WeekDay = { date: string; label: string; dayLabel: string };

type BandBucket = { services: Service[]; events: OpsEvent[] };
type DayBuckets = Record<Band | "untimed", BandBucket>;

const BAND_LABELS: Record<Band, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

function emptyBuckets(): DayBuckets {
  return {
    morning: { services: [], events: [] },
    afternoon: { services: [], events: [] },
    evening: { services: [], events: [] },
    untimed: { services: [], events: [] },
  };
}

export default function WeekView({
  weekDays,
  byDate,
  eventsByDate,
  today,
  now,
  viewMode,
  loading,
  weekKey,
  weekContainsToday,
  serviceActions,
  eventActions,
  onDayHeader,
}: {
  weekDays: WeekDay[];
  byDate: Record<string, Service[]>;
  eventsByDate: Record<string, OpsEvent[]>;
  today: string;
  now: Date;
  viewMode: "active" | "cancelled";
  loading: boolean;
  weekKey: string;
  weekContainsToday: boolean;
  serviceActions: Pick<ServiceActionProps, "onReschedule" | "onCancel">;
  eventActions: Pick<EventActionProps, "onView" | "onReschedule" | "onCancel">;
  onDayHeader: (date: string) => void;
}) {
  /* ---- Bucket each day's services + events into time bands ---- */
  const dayBuckets = useMemo(() => {
    const map: Record<string, DayBuckets> = {};
    for (const day of weekDays) {
      const buckets = emptyBuckets();
      for (const svc of byDate[day.date] ?? []) {
        const band = getBand(svc.time_window_start);
        buckets[band ?? "untimed"].services.push(svc);
      }
      for (const evt of eventsByDate[day.date] ?? []) {
        const band = getBand(evt.time_start);
        buckets[band ?? "untimed"].events.push(evt);
      }
      // keep within-band order by time
      for (const key of Object.keys(buckets) as (Band | "untimed")[]) {
        buckets[key].services.sort(sortByTime);
        buckets[key].events.sort(sortEventsByTime);
      }
      map[day.date] = buckets;
    }
    return map;
  }, [weekDays, byDate, eventsByDate]);

  // Which bands have any content across the visible week
  const visibleBands = useMemo(() => {
    const order: Band[] = ["morning", "afternoon", "evening"];
    return order.filter((band) =>
      weekDays.some((d) => {
        const b = dayBuckets[d.date]?.[band];
        return b && (b.services.length > 0 || b.events.length > 0);
      })
    );
  }, [dayBuckets, weekDays]);

  const untimedPresent = useMemo(
    () =>
      weekDays.some((d) => {
        const b = dayBuckets[d.date]?.untimed;
        return b && (b.services.length > 0 || b.events.length > 0);
      }),
    [dayBuckets, weekDays]
  );

  // Per-day health counts
  const dayCounts = useMemo(() => {
    const map: Record<string, { done: number; due: number }> = {};
    for (const day of weekDays) {
      const svcs = byDate[day.date] ?? [];
      map[day.date] = {
        done: svcs.filter((s) => s.status === "completed").length,
        due: svcs.filter((s) => needsAttention(s, now)).length,
      };
    }
    return map;
  }, [byDate, weekDays, now]);

  const weekAttention = useMemo(
    () => Object.values(dayCounts).reduce((sum, c) => sum + c.due, 0),
    [dayCounts]
  );

  /* ---- Mobile: auto-scroll today's block into view on landing ---- */
  const todayRef = useRef<HTMLDivElement>(null);
  const lastLandedWeek = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const landed = lastLandedWeek.current !== weekKey;
    lastLandedWeek.current = weekKey;
    if (!landed) return; // same week — don't fight manual scrolling
    if (!weekContainsToday) return; // viewing another week — respect position
    // scrollIntoView on the mobile block; it is display:none on desktop (no-op there)
    todayRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [loading, weekKey, weekContainsToday]);

  function renderCellContent(buckets: BandBucket) {
    return (
      <>
        {buckets.services.map((svc) => (
          <ServicePill
            key={svc.id}
            svc={svc}
            now={now}
            variant="desktop"
            viewMode={viewMode}
            onReschedule={serviceActions.onReschedule}
            onCancel={serviceActions.onCancel}
          />
        ))}
        {buckets.events.map((evt) => (
          <EventPill
            key={`event-${evt.id}`}
            event={evt}
            variant="desktop"
            viewMode={viewMode}
            onView={eventActions.onView}
            onReschedule={eventActions.onReschedule}
            onCancel={eventActions.onCancel}
          />
        ))}
      </>
    );
  }

  if (loading) {
    return <p className="text-sm text-sage text-center py-10">Loading...</p>;
  }

  return (
    <>
      {/* Week-level attention chip */}
      {weekAttention > 0 && (
        <div className="mb-2 flex justify-end">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-terra bg-terra/10 px-2.5 py-1 rounded-full">
            {weekAttention} need attention
          </span>
        </div>
      )}

      {/* Desktop: time-banded weekly grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1">
          {/* Column headers (clickable → Day view) */}
          {weekDays.map((day) => {
            const isToday = day.date === today;
            const counts = dayCounts[day.date];
            return (
              <button
                key={`head-${day.date}`}
                onClick={() => onDayHeader(day.date)}
                title="Open day view"
                className={`text-center py-2 px-1 rounded-t-xl transition-colors ${
                  isToday
                    ? "bg-forest text-offwhite"
                    : "bg-offwhite text-sage hover:bg-cream"
                }`}
              >
                <span className="block text-xs font-medium">
                  {day.dayLabel} {day.label}
                </span>
                <span className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px]">
                  <span className={isToday ? "text-offwhite/80" : "text-sage"}>
                    {counts.done} done
                  </span>
                  {counts.due > 0 && (
                    <span
                      className={`px-1 rounded-full font-medium ${
                        isToday ? "bg-offwhite/20 text-offwhite" : "bg-terra/10 text-terra"
                      }`}
                    >
                      {counts.due} due
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {/* Time bands */}
          {visibleBands.map((band) => (
            <BandRow
              key={band}
              label={BAND_LABELS[band]}
              weekDays={weekDays}
              today={today}
              renderCell={(date) => renderCellContent(dayBuckets[date][band])}
              isEmptyCell={(date) => {
                const b = dayBuckets[date][band];
                return b.services.length === 0 && b.events.length === 0;
              }}
            />
          ))}

          {/* Untimed group */}
          {untimedPresent && (
            <BandRow
              label="Untimed"
              weekDays={weekDays}
              today={today}
              renderCell={(date) => renderCellContent(dayBuckets[date].untimed)}
              isEmptyCell={(date) => {
                const b = dayBuckets[date].untimed;
                return b.services.length === 0 && b.events.length === 0;
              }}
            />
          )}

          {/* Fully empty week */}
          {visibleBands.length === 0 && !untimedPresent && (
            <div className="col-span-7 text-center text-sm text-stone py-10">
              {viewMode === "cancelled" ? "No cancelled items this week" : "No visits this week"}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: vertical stacked day list */}
      <div className="md:hidden space-y-3">
        {weekDays.map((day) => {
          const dayServices = byDate[day.date] ?? [];
          const dayEvents = eventsByDate[day.date] ?? [];
          const isToday = day.date === today;
          const totalItems = dayServices.length + dayEvents.length;
          const counts = dayCounts[day.date];

          return (
            <div key={day.date} ref={isToday ? todayRef : undefined} className="scroll-mt-24">
              <button
                onClick={() => onDayHeader(day.date)}
                className="flex items-center gap-2 mb-1.5 w-full text-left"
              >
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
                {counts.done > 0 && (
                  <span className="text-xs text-sage">{counts.done} done</span>
                )}
                {counts.due > 0 && (
                  <span className="text-xs font-medium text-terra bg-terra/10 px-1.5 py-0.5 rounded-full">
                    {counts.due} due
                  </span>
                )}
              </button>

              {totalItems === 0 ? (
                <div className="bg-offwhite rounded-xl border border-stone/40 px-4 py-3 text-xs text-stone">
                  {viewMode === "cancelled" ? "No cancelled items" : "No visits"}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dayServices.map((svc) => (
                    <ServicePill
                      key={svc.id}
                      svc={svc}
                      now={now}
                      variant="mobile"
                      viewMode={viewMode}
                      onReschedule={serviceActions.onReschedule}
                      onCancel={serviceActions.onCancel}
                    />
                  ))}
                  {dayEvents.map((evt) => (
                    <EventPill
                      key={`event-${evt.id}`}
                      event={evt}
                      variant="mobile"
                      viewMode={viewMode}
                      onView={eventActions.onView}
                      onReschedule={eventActions.onReschedule}
                      onCancel={eventActions.onCancel}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- One horizontal band row: label spanning + 7 day cells ---------- */

function BandRow({
  label,
  weekDays,
  today,
  renderCell,
  isEmptyCell,
}: {
  label: string;
  weekDays: WeekDay[];
  today: string;
  renderCell: (date: string) => React.ReactNode;
  isEmptyCell: (date: string) => boolean;
}) {
  return (
    <>
      <div className="col-span-7 mt-1 px-1 text-[10px] font-medium uppercase tracking-widest text-sage">
        {label}
      </div>
      {weekDays.map((day) => {
        const isToday = day.date === today;
        return (
          <div
            key={`${label}-${day.date}`}
            className={`border border-stone/40 rounded-xl p-1.5 min-h-[64px] space-y-1 ${
              isToday ? "bg-forest/5" : "bg-offwhite"
            }`}
          >
            {isEmptyCell(day.date) ? (
              <p className="text-[10px] text-stone text-center pt-3">&mdash;</p>
            ) : (
              renderCell(day.date)
            )}
          </div>
        );
      })}
    </>
  );
}
