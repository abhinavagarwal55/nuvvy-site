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
  getStatusLabel,
  getServiceHref,
  getBand,
  needsAttention,
  timeToMinutes,
  blockDurationMinutes,
  formatTime,
  sortByTime,
  sortEventsByTime,
  Band,
} from "./shared";

const PX_PER_MIN = 1.2; // 1 hour ≈ 72px
const GUTTER_PX = 56; // left time-axis gutter (w-14)
const MIN_BLOCK_PX = 22; // ~ keep very short visits tappable
const MIN_DUR_MIN = 15; // floor for overlap math / height

// Muted, earthy palette so each gardener column reads as a distinct colour
// against the white grid. Unassigned uses terra.
const GARDENER_COLORS = [
  "#2D5A3D", // forest
  "#0E7C86", // teal
  "#A6792E", // ochre
  "#6B5B95", // plum
  "#3E6E8E", // slate blue
  "#8A5A44", // clay
  "#7A8450", // moss
  "#9C5C7A", // mauve
];
const TERRA = "#B5654A";

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Band boundaries in minutes (Morning 8–12, Afternoon 12–3, Evening 3–6)
const NOON = 12 * 60;
const EVENING = 15 * 60;

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
  color: string;
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
          color: TERRA,
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
    let palette = 0;
    for (const c of cols) {
      c.color = c.id === null ? TERRA : GARDENER_COLORS[palette++ % GARDENER_COLORS.length];
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

  // Morning / Afternoon / Evening regions clamped to the visible axis
  const bandRegions = useMemo(() => {
    const defs = [
      { key: "morning", label: "Morning · 8–12", start: axisStart, end: NOON, tint: "transparent" },
      { key: "afternoon", label: "Afternoon · 12–3", start: NOON, end: EVENING, tint: "rgba(45,90,61,0.04)" },
      { key: "evening", label: "Evening · 3–6", start: EVENING, end: axisEnd, tint: "rgba(45,90,61,0.08)" },
    ];
    return defs
      .map((d) => ({
        ...d,
        start: Math.max(d.start, axisStart),
        end: Math.min(d.end, axisEnd),
      }))
      .filter((d) => d.end > d.start);
  }, [axisStart, axisEnd]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = isToday && nowMin >= axisStart && nowMin <= axisEnd;

  const hasContent = services.length > 0 || events.length > 0;

  /* ---- Mobile agenda: services + events grouped into time bands ---- */
  const agendaGroups = useMemo(() => {
    type Item = { key: string; sortMin: number; band: Band | "untimed"; node: React.ReactNode };
    const items: Item[] = [];
    for (const svc of services) {
      const mins = timeToMinutes(svc.time_window_start);
      items.push({
        key: `svc-${svc.id}`,
        sortMin: mins ?? Number.MAX_SAFE_INTEGER,
        band: getBand(svc.time_window_start) ?? "untimed",
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
    for (const evt of events) {
      const mins = timeToMinutes(evt.time_start);
      items.push({
        key: `evt-${evt.id}`,
        sortMin: mins ?? Number.MAX_SAFE_INTEGER,
        band: getBand(evt.time_start) ?? "untimed",
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
    const order: { band: Band | "untimed"; label: string }[] = [
      { band: "morning", label: "Morning · 8–12" },
      { band: "afternoon", label: "Afternoon · 12–3" },
      { band: "evening", label: "Evening · 3–6" },
      { band: "untimed", label: "Untimed" },
    ];
    return order
      .map(({ band, label }) => ({
        label,
        items: items.filter((i) => i.band === band).sort((a, b) => a.sortMin - b.sortMin),
      }))
      .filter((g) => g.items.length > 0);
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
            {/* Column headers (per-gardener colour) */}
            <div className="flex gap-1" style={{ paddingLeft: GUTTER_PX }}>
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="flex-1 text-center py-1.5 px-1 rounded-t-lg text-xs font-medium truncate text-offwhite"
                  style={{ backgroundColor: col.color }}
                  title={col.name}
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
                      <div
                        className="border rounded-lg p-1 space-y-1"
                        style={{ borderColor: hexA(col.color, 0.4), backgroundColor: hexA(col.color, 0.06) }}
                      >
                        <p className="text-[9px] uppercase tracking-widest text-sage px-1">
                          Untimed
                        </p>
                        {col.untimed.map((svc) => (
                          <DayBlockCard
                            key={svc.id}
                            svc={svc}
                            now={now}
                            color={col.color}
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

            {/* Time grid body — white surface with banded shading */}
            <div
              className="relative rounded-b-lg border border-stone/40 bg-offwhite"
              style={{ height: totalPx }}
            >
              {/* band regions (behind) + range labels in the gutter */}
              {bandRegions.map((b) => {
                const top = (b.start - axisStart) * PX_PER_MIN;
                const height = (b.end - b.start) * PX_PER_MIN;
                return (
                  <div key={`band-${b.key}`}>
                    <div
                      className="absolute left-0 right-0 z-0"
                      style={{ top, height, backgroundColor: b.tint }}
                    />
                    <span
                      className="absolute left-0 z-0 px-1 text-[9px] font-medium uppercase tracking-wide text-sage/80"
                      style={{ top: top + 2, width: GUTTER_PX, lineHeight: 1.1 }}
                    >
                      {b.label}
                    </span>
                  </div>
                );
              })}

              {/* hour gridlines + axis labels */}
              {hours.map((h) => {
                const top = (h * 60 - axisStart) * PX_PER_MIN;
                return (
                  <div
                    key={`line-${h}`}
                    className="absolute left-0 right-0 z-0 border-t border-stone/30"
                    style={{ top }}
                  >
                    <span
                      className="absolute -top-2 right-1 text-[10px] text-sage"
                      style={{ width: GUTTER_PX - 4, textAlign: "right" }}
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
                className="absolute top-0 bottom-0 right-0 z-10 flex gap-1"
                style={{ left: GUTTER_PX }}
              >
                {columns.map((col, ci) => (
                  <div key={col.key} className="relative flex-1">
                    {packed[ci].map((p) => (
                      <DayBlock
                        key={p.svc.id}
                        placed={p}
                        axisStart={axisStart}
                        color={col.color}
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

      {/* ===== Mobile: single-column agenda grouped by band ===== */}
      <div className="sm:hidden space-y-4">
        {agendaGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-medium uppercase tracking-widest text-sage mb-1.5">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <div key={item.key}>{item.node}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Visit block styling ---------- */

const CANCELLED_GREY = "#9C9384";

/** Accent colour: cancelled = grey, needs-attention = terra, else gardener colour. */
function blockAccent(svc: Service, now: Date, color: string): string {
  if (svc.status === "cancelled") return CANCELLED_GREY;
  if (needsAttention(svc, now)) return TERRA;
  return color;
}

function BlockInner({
  svc,
  now,
  viewMode,
  onReschedule,
  onCancel,
  showBadge,
}: {
  svc: Service;
  now: Date;
  viewMode: "active" | "cancelled";
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
  showBadge: boolean;
}) {
  const label = getStatusLabel(svc, now);
  return (
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
      {showBadge && (
        <p className={`mt-0.5 inline-block text-[9px] px-1 rounded-full ${label.cls}`}>
          {label.text}
        </p>
      )}
    </div>
  );
}

/* ---------- One positioned visit block (timed) ---------- */

function DayBlock({
  placed,
  axisStart,
  color,
  now,
  viewMode,
  onReschedule,
  onCancel,
}: {
  placed: Placed;
  axisStart: number;
  color: string;
  now: Date;
  viewMode: "active" | "cancelled";
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
}) {
  const { svc, startMin, durMin, lane, lanes } = placed;
  const height = Math.max(durMin * PX_PER_MIN, MIN_BLOCK_PX);
  const accent = blockAccent(svc, now, color);
  const cancelled = svc.status === "cancelled";
  const href = getServiceHref(svc);

  const style: React.CSSProperties = {
    top: (startMin - axisStart) * PX_PER_MIN,
    height,
    left: `${(lane / lanes) * 100}%`,
    width: `calc(${100 / lanes}% - 2px)`,
    borderLeftColor: accent,
    backgroundColor: cancelled ? "rgba(0,0,0,0.05)" : hexA(accent, 0.16),
  };
  const cls = `absolute rounded-lg border border-l-[3px] border-y-transparent border-r-transparent px-1.5 py-1 overflow-hidden shadow-sm ${
    cancelled ? "line-through opacity-70" : "hover:shadow-md transition-shadow"
  }`;
  const inner = (
    <BlockInner
      svc={svc}
      now={now}
      viewMode={viewMode}
      onReschedule={onReschedule}
      onCancel={onCancel}
      showBadge={height >= 44}
    />
  );

  if (href && viewMode === "active") {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${cls} cursor-default`} style={style}>
      {inner}
    </div>
  );
}

/* ---------- One untimed visit card (tray) ---------- */

function DayBlockCard({
  svc,
  color,
  now,
  viewMode,
  onReschedule,
  onCancel,
}: {
  svc: Service;
  color: string;
  now: Date;
  viewMode: "active" | "cancelled";
  onReschedule: (svc: Service) => void;
  onCancel: (svc: Service) => void;
}) {
  const accent = blockAccent(svc, now, color);
  const cancelled = svc.status === "cancelled";
  const href = getServiceHref(svc);
  const style: React.CSSProperties = {
    borderLeftColor: accent,
    backgroundColor: cancelled ? "rgba(0,0,0,0.05)" : hexA(accent, 0.16),
  };
  const cls = `block rounded-lg border border-l-[3px] border-y-transparent border-r-transparent px-1.5 py-1 ${
    cancelled ? "line-through opacity-70" : "hover:shadow-sm transition-shadow"
  }`;
  const inner = (
    <BlockInner
      svc={svc}
      now={now}
      viewMode={viewMode}
      onReschedule={onReschedule}
      onCancel={onCancel}
      showBadge
    />
  );

  if (href && viewMode === "active") {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${cls} cursor-default`} style={style}>
      {inner}
    </div>
  );
}
