"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Service,
  OpsEvent,
  ServiceActionProps,
  EventActionProps,
  ServicePill,
  EventPill,
  PillDropdown,
  getServiceStatusColor,
  getStatusLabel,
  getServiceHref,
  timeToMinutes,
  blockDurationMinutes,
  formatTime,
  sortByTime,
  sortEventsByTime,
} from "./shared";

const PX_PER_MIN = 1.2; // 1 hour ≈ 72px
const GUTTER_PX = 56; // left time-axis gutter (w-14)
const MIN_BLOCK_PX = 22; // ~ keep very short visits tappable
const MIN_DUR_MIN = 15; // floor for overlap math / height

type Placed = {
  svc: Service;
  startMin: number;
  durMin: number;
  lane: number;
  lanes: number;
};

type Column = {
  key: string;
  id: string | null; // null = unassigned
  name: string;
  timed: Service[];
  untimed: Service[];
};

/** Outlook-style lane packing within one gardener column. */
function packLanes(timed: Service[], now: Date): Placed[] {
  const items: Placed[] = timed
    .map((svc) => ({
      svc,
      startMin: timeToMinutes(svc.time_window_start) ?? 0,
      durMin: Math.max(blockDurationMinutes(svc, now), MIN_DUR_MIN),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.durMin - b.durMin);

  const result: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= it.startMin) {
          it.lane = i;
          laneEnds[i] = it.startMin + it.durMin;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.lane = laneEnds.length;
        laneEnds.push(it.startMin + it.durMin);
      }
    }
    const lanes = laneEnds.length;
    for (const it of cluster) {
      it.lanes = lanes;
      result.push(it);
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.startMin + it.durMin);
  }
  if (cluster.length) flush();
  return result;
}

export default function DayView({
  services,
  events,
  date,
  today,
  now,
  viewMode,
  loading,
  serviceActions,
  eventActions,
}: {
  services: Service[];
  events: OpsEvent[];
  date: string;
  today: string;
  now: Date;
  viewMode: "active" | "cancelled";
  loading: boolean;
  serviceActions: Pick<ServiceActionProps, "onReschedule" | "onCancel">;
  eventActions: Pick<EventActionProps, "onView" | "onReschedule" | "onCancel">;
}) {
  const isToday = date === today;

  /* ---- Build per-gardener columns ---- */
  const columns = useMemo<Column[]>(() => {
    const map = new Map<string, Column>();
    for (const svc of services) {
      const key = svc.assigned_gardener_id ?? "__unassigned__";
      let col = map.get(key);
      if (!col) {
        col = {
          key,
          id: svc.assigned_gardener_id,
          name: svc.assigned_gardener_id ? svc.gardener_name ?? "Unknown" : "Unassigned",
          timed: [],
          untimed: [],
        };
        map.set(key, col);
      }
      if (timeToMinutes(svc.time_window_start) !== null) col.timed.push(svc);
      else col.untimed.push(svc);
    }
    const cols = [...map.values()];
    cols.sort((a, b) => {
      if (a.id === null) return 1; // unassigned last
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
    for (const c of cols) {
      c.timed.sort(sortByTime);
      c.untimed.sort(sortByTime);
    }
    return cols;
  }, [services]);

  /* ---- Time-axis range (default 08:00–16:00, expand to cover outliers) ---- */
  const { axisStart, axisEnd } = useMemo(() => {
    let earliest = 8 * 60;
    let latest = 16 * 60;
    for (const svc of services) {
      const s = timeToMinutes(svc.time_window_start);
      if (s === null) continue;
      const dur = Math.max(blockDurationMinutes(svc, now), MIN_DUR_MIN);
      earliest = Math.min(earliest, s);
      latest = Math.max(latest, s + dur);
    }
    return {
      axisStart: Math.floor(earliest / 60) * 60,
      axisEnd: Math.ceil(latest / 60) * 60,
    };
  }, [services, now]);

  const totalPx = (axisEnd - axisStart) * PX_PER_MIN;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = axisStart / 60; h <= axisEnd / 60; h++) out.push(h);
    return out;
  }, [axisStart, axisEnd]);

  // Pre-pack each column's timed blocks
  const packed = useMemo(
    () => columns.map((c) => packLanes(c.timed, now)),
    [columns, now]
  );

  const anyUntimed = columns.some((c) => c.untimed.length > 0);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = isToday && nowMin >= axisStart && nowMin <= axisEnd;

  const hasContent = services.length > 0 || events.length > 0;

  /* ---- Mobile agenda: services + events merged by start time ---- */
  const agenda = useMemo(() => {
    const items: { key: string; sortMin: number; node: React.ReactNode }[] = [];
    for (const svc of [...services].sort(sortByTime)) {
      items.push({
        key: `svc-${svc.id}`,
        sortMin: timeToMinutes(svc.time_window_start) ?? Number.MAX_SAFE_INTEGER,
        node: (
          <ServicePill
            svc={svc}
            now={now}
            variant="mobile"
            viewMode={viewMode}
            onReschedule={serviceActions.onReschedule}
            onCancel={serviceActions.onCancel}
          />
        ),
      });
    }
    for (const evt of [...events].sort(sortEventsByTime)) {
      items.push({
        key: `evt-${evt.id}`,
        sortMin: timeToMinutes(evt.time_start) ?? Number.MAX_SAFE_INTEGER,
        node: (
          <EventPill
            event={evt}
            variant="mobile"
            viewMode={viewMode}
            onView={eventActions.onView}
            onReschedule={eventActions.onReschedule}
            onCancel={eventActions.onCancel}
          />
        ),
      });
    }
    return items.sort((a, b) => a.sortMin - b.sortMin);
  }, [services, events, now, viewMode, serviceActions, eventActions]);

  if (loading) {
    return <p className="text-sm text-sage text-center py-10">Loading...</p>;
  }

  if (!hasContent) {
    return (
      <div className="text-center text-sm text-stone py-16">
        {viewMode === "cancelled" ? "No cancelled items this day" : "No visits scheduled"}
      </div>
    );
  }

  return (
    <>
      {/* ===== Desktop / tablet: per-gardener resource grid ===== */}
      <div className="hidden sm:block">
        {/* Events strip (full width — events have no gardener) */}
        {events.length > 0 && (
          <div className="mb-2" style={{ paddingLeft: GUTTER_PX }}>
            <div className="space-y-1">
              {[...events].sort(sortEventsByTime).map((evt) => (
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
            </div>
          </div>
        )}

        {columns.length === 0 ? (
          <div className="text-center text-sm text-stone py-10" style={{ paddingLeft: GUTTER_PX }}>
            No visits assigned to a gardener this day.
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex gap-1" style={{ paddingLeft: GUTTER_PX }}>
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={`flex-1 text-center py-1.5 px-1 rounded-t-xl text-xs font-medium truncate ${
                    col.id === null ? "bg-terra/10 text-terra" : "bg-offwhite text-charcoal"
                  }`}
                >
                  {col.name}
                </div>
              ))}
            </div>

            {/* Untimed tray (per column) */}
            {anyUntimed && (
              <div className="flex gap-1 mb-1" style={{ paddingLeft: GUTTER_PX }}>
                {columns.map((col) => (
                  <div key={`untimed-${col.key}`} className="flex-1 space-y-1">
                    {col.untimed.length > 0 && (
                      <div className="bg-cream/60 border border-stone/40 rounded-lg p-1 space-y-1">
                        <p className="text-[9px] uppercase tracking-widest text-sage px-1">
                          Untimed
                        </p>
                        {col.untimed.map((svc) => (
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Time grid body */}
            <div className="relative" style={{ height: totalPx }}>
              {/* hour gridlines + axis labels */}
              {hours.map((h) => {
                const top = (h * 60 - axisStart) * PX_PER_MIN;
                return (
                  <div
                    key={`line-${h}`}
                    className="absolute left-0 right-0 border-t border-stone/30"
                    style={{ top }}
                  >
                    <span
                      className="absolute -top-2 left-0 text-[10px] text-sage"
                      style={{ width: GUTTER_PX }}
                    >
                      {formatTime(`${String(h).padStart(2, "0")}:00`)}
                    </span>
                  </div>
                );
              })}

              {/* now-line (today only) */}
              {showNowLine && (
                <div
                  className="absolute right-0 z-20 border-t-2 border-terra pointer-events-none"
                  style={{ top: (nowMin - axisStart) * PX_PER_MIN, left: GUTTER_PX }}
                >
                  <span className="absolute -top-2 -left-[52px] text-[9px] font-medium text-terra">
                    now {formatTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)}
                  </span>
                </div>
              )}

              {/* columns with positioned blocks */}
              <div
                className="absolute top-0 bottom-0 right-0 flex gap-1"
                style={{ left: GUTTER_PX }}
              >
                {columns.map((col, ci) => (
                  <div key={col.key} className="relative flex-1">
                    {packed[ci].map((p) => (
                      <DayBlock
                        key={p.svc.id}
                        placed={p}
                        axisStart={axisStart}
                        now={now}
                        viewMode={viewMode}
                        onReschedule={serviceActions.onReschedule}
                        onCancel={serviceActions.onCancel}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== Mobile: single-column time-ordered agenda ===== */}
      <div className="sm:hidden space-y-1.5">
        {agenda.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
      </div>
    </>
  );
}

/* ---------- One positioned visit block ---------- */

function DayBlock({
  placed,
  axisStart,
  now,
  viewMode,
  onReschedule,
  onCancel,
}: {
  placed: Placed;
  axisStart: number;
  now: Date;
  viewMode: "active" | "cancelled";
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
}) {
  const { svc, startMin, durMin, lane, lanes } = placed;
  const top = (startMin - axisStart) * PX_PER_MIN;
  const height = Math.max(durMin * PX_PER_MIN, MIN_BLOCK_PX);
  const colorCls = getServiceStatusColor(svc, now);
  const label = getStatusLabel(svc, now);
  const href = getServiceHref(svc);

  const style: React.CSSProperties = {
    top,
    height,
    left: `${(lane / lanes) * 100}%`,
    width: `calc(${100 / lanes}% - 2px)`,
  };

  const inner = (
    <div className="h-full overflow-hidden">
      <div className="flex items-start justify-between gap-0.5">
        <p className="text-[11px] font-medium text-charcoal leading-tight break-words">
          {svc.time_window_start ? `${formatTime(svc.time_window_start)} ` : ""}
          {svc.customer_name}
        </p>
        {viewMode === "active" && (
          <PillDropdown svc={svc} onReschedule={onReschedule} onCancel={onCancel} />
        )}
      </div>
      {height >= 44 && (
        <p className={`mt-0.5 inline-block text-[9px] px-1 rounded-full ${label.cls}`}>
          {label.text}
        </p>
      )}
    </div>
  );

  if (href && viewMode === "active") {
    return (
      <Link
        href={href}
        className={`absolute rounded-lg border-l-[3px] px-1.5 py-1 ${colorCls} hover:shadow-sm transition-shadow`}
        style={style}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      className={`absolute rounded-lg border-l-[3px] px-1.5 py-1 ${colorCls} cursor-default`}
      style={style}
    >
      {inner}
    </div>
  );
}
