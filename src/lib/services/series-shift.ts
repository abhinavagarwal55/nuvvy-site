/**
 * Series-shift planner — the single source of truth for "Move this visit and
 * shift the schedule" (PRD: Reschedule with Cadence Shift, §5.2 / §5.2.1).
 *
 * This is a PURE function: no DB, no I/O. Both the preview (dry run) and the
 * commit call it so the confirmed result is byte-for-byte the previewed result.
 *
 * The shift re-phases the fortnightly/monthly cadence to the WEEK of the moved
 * visit, while keeping the slot's original weekday, time and gardener. The moved
 * visit itself may land on a different weekday that one week (a one-off); every
 * subsequent recurring visit stays on the ORIGINAL weekday.
 *
 * Anchor = the slot's existing day_of_week within the Mon–Sun week that contains
 * `newDate`. Generation then reproduces exactly what generateServices() would
 * produce with effectiveFrom=anchor, fromDate=newDate+1 (the anchor-week cycle is
 * claimed by the moved visit via original_scheduled_date=anchor, so it is skipped).
 */
import {
  FREQ_DAYS,
  computeOccurrences,
  firstDayOfWeekOnOrAfter,
  formatDate,
} from "./scheduling";

/** JS getDay() (0=Sun..6=Sat) → short weekday name. */
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** DB day_of_week (0=Mon..6=Sun) → short weekday name, for labels/summary. */
const DB_WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface UpcomingVisit {
  date: string; // YYYY-MM-DD
  weekday: string; // "Tue"
  is_moved_visit: boolean;
}

export interface RemovedVisit {
  id?: string;
  date: string; // YYYY-MM-DD
  weekday: string; // "Tue"
}

export interface SeriesShiftPlan {
  anchor: string; // YYYY-MM-DD — slot's weekday within the week of newDate
  upcoming: UpcomingVisit[];
  removed: RemovedVisit[];
  summary: string;
}

export interface PlanSeriesShiftInput {
  /** The slot being re-phased — only its weekday matters for planning. */
  slot: { day_of_week: number };
  /** The visit being moved (id + its current cycle date). */
  visit: { id: string; scheduled_date: string };
  /** Requested new date for the moved visit (YYYY-MM-DD). */
  newDate: string;
  /** 'weekly' | 'fortnightly' | 'monthly'. */
  visitFrequency: string;
  /**
   * All future `scheduled` visits currently on the slot (id + date). Used to
   * compute `removed` — those with scheduled_date > newDate, excluding the moved
   * visit itself. Pure: the caller queries these; the planner never touches the DB.
   */
  futureScheduledVisits?: Array<{ id: string; scheduled_date: string }>;
  /** Generation horizon in weeks — MUST match generateServices (default 6). */
  weeksAhead?: number;
}

/**
 * Return the Monday (DB day 0) of the Mon–Sun week that contains `date`.
 */
function mondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const jsDow = d.getDay(); // 0=Sun..6=Sat
  // Days since Monday: Sun(0)→6, Mon(1)→0, Tue(2)→1 ... Sat(6)→5.
  const daysSinceMonday = (jsDow + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** Short weekday name for a YYYY-MM-DD string. */
export function weekdayName(dateStr: string): string {
  return WEEKDAY_NAMES[new Date(dateStr + "T00:00:00").getDay()];
}

/**
 * Plan a series shift. Pure — safe for preview and reused verbatim by commit.
 */
export function planSeriesShift(input: PlanSeriesShiftInput): SeriesShiftPlan {
  const {
    slot,
    visit,
    newDate,
    visitFrequency,
    futureScheduledVisits = [],
    weeksAhead = 6,
  } = input;

  const intervalDays = FREQ_DAYS[visitFrequency];
  if (!intervalDays) {
    throw new Error(`Unknown visit frequency: ${visitFrequency}`);
  }

  // Anchor = slot's original weekday within the Mon–Sun week of newDate.
  // firstDayOfWeekOnOrAfter(Monday-of-week, dayOfWeek) always lands in that
  // same week (0–6 days out), so it snaps to the correct weekday.
  const anchorDate = firstDayOfWeekOnOrAfter(mondayOfWeek(newDate), slot.day_of_week);
  const anchor = formatDate(anchorDate);

  // Recurring visits: exactly what generateServices() would create with
  // effectiveFrom=anchor, fromDate=newDate+1. The anchor-week cycle date is
  // claimed by the moved visit (original_scheduled_date=anchor), so drop it —
  // this mirrors generateServices' idempotency-by-original_scheduled_date.
  const recurringDates = computeOccurrences(
    slot.day_of_week,
    intervalDays,
    anchor,
    addDays(newDate, 1),
    weeksAhead
  ).filter((d) => d !== anchor);

  const upcoming: UpcomingVisit[] = [
    { date: newDate, weekday: weekdayName(newDate), is_moved_visit: true },
    ...recurringDates.map((date) => ({
      date,
      weekday: weekdayName(date),
      is_moved_visit: false,
    })),
  ];

  // Removed = future scheduled visits on the slot after newDate, excluding the
  // moved visit itself (a backward move leaves the moved visit's old date > newDate).
  const removed: RemovedVisit[] = futureScheduledVisits
    .filter((v) => v.id !== visit.id && v.scheduled_date > newDate)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .map((v) => ({
      id: v.id,
      date: v.scheduled_date,
      weekday: weekdayName(v.scheduled_date),
    }));

  const freqLabel =
    visitFrequency.charAt(0).toUpperCase() + visitFrequency.slice(1);
  const weekdayLabel = DB_WEEKDAY_NAMES[slot.day_of_week] ?? weekdayName(anchor);
  const summary = `${freqLabel} visits move to a new week, staying on ${weekdayLabel}.`;

  return { anchor, upcoming, removed, summary };
}
