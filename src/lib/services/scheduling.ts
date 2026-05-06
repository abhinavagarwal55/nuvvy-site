import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Frequency → days between visits.
 * DB values: 'weekly' | 'fortnightly' | 'monthly'
 */
const FREQ_DAYS: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
};

export interface GenerateServicesInput {
  slotId: string;
  customerId: string;
  gardenerId: string;
  subscriptionId: string;
  dayOfWeek: number; // 0=Mon ... 6=Sun
  timeStart: string; // HH:MM
  timeEnd: string;
  visitFrequency: string; // 'weekly' | 'fortnightly' | 'monthly'
  effectiveFrom: string; // YYYY-MM-DD — the slot's cycle anchor
  fromDate: string; // YYYY-MM-DD — only generate dates on/after this
  weeksAhead?: number; // default 6
}

/**
 * Generate service visit rows for a slot.
 *
 * Cycle dates are anchored to slot.effective_from (stable across calls),
 * never to today. This means calling generateServices() on different days
 * produces dates aligned to the same cycle — fortnightly stays fortnightly.
 *
 * Idempotent: skips dates that already have a service for this slot
 * (matched by original_scheduled_date so reschedules don't trigger
 * re-creation of the original date).
 *
 * Returns the number of services inserted.
 */
export async function generateServices(
  supabase: SupabaseClient,
  input: GenerateServicesInput
): Promise<number> {
  const {
    slotId,
    customerId,
    gardenerId,
    subscriptionId,
    dayOfWeek,
    timeStart,
    timeEnd,
    visitFrequency,
    effectiveFrom,
    fromDate,
    weeksAhead = 6,
  } = input;

  const intervalDays = FREQ_DAYS[visitFrequency];
  if (!intervalDays) {
    throw new Error(`Unknown visit frequency: ${visitFrequency}`);
  }

  // Compute cycle dates anchored to the slot's effective_from
  const dates = computeOccurrences(
    dayOfWeek,
    intervalDays,
    effectiveFrom,
    fromDate,
    weeksAhead
  );

  if (dates.length === 0) return 0;

  // Idempotency check by original_scheduled_date — covers services that
  // have been rescheduled away from their original cycle date.
  const { data: existing } = await supabase
    .from("service_visits")
    .select("original_scheduled_date")
    .eq("slot_id", slotId)
    .in("original_scheduled_date", dates);

  const existingDates = new Set(
    (existing ?? []).map((e) => e.original_scheduled_date)
  );

  const newDates = dates.filter((d) => !existingDates.has(d));
  if (newDates.length === 0) return 0;

  const rows = newDates.map((date) => ({
    customer_id: customerId,
    subscription_id: subscriptionId,
    assigned_gardener_id: gardenerId,
    slot_id: slotId,
    scheduled_date: date,
    original_scheduled_date: date,
    time_window_start: timeStart,
    time_window_end: timeEnd,
    status: "scheduled",
  }));

  const { data: inserted, error } = await supabase
    .from("service_visits")
    .insert(rows)
    .select("id");
  if (error) {
    throw new Error(`Failed to generate services: ${error.message}`);
  }

  // Populate junction table so the gardener can see these services on
  // the gardener "today"/"history" views (which filter via this table).
  if (inserted && inserted.length > 0) {
    const junctionRows = inserted.map((r) => ({
      service_id: r.id,
      gardener_id: gardenerId,
    }));
    const { error: junctionErr } = await supabase
      .from("service_visit_gardeners")
      .insert(junctionRows);
    if (junctionErr) {
      throw new Error(`Failed to populate gardener junction: ${junctionErr.message}`);
    }
  }

  return newDates.length;
}

/**
 * Compute cycle dates anchored to effectiveFrom, restricted to the
 * window [fromDate, fromDate + weeksAhead*7).
 *
 * dayOfWeek: 0=Mon ... 6=Sun (DB convention)
 * intervalDays: 7 / 14 / 28
 */
function computeOccurrences(
  dayOfWeek: number,
  intervalDays: number,
  effectiveFromStr: string,
  fromDateStr: string,
  weeksAhead: number
): string[] {
  // Find the first occurrence of dayOfWeek on or after effectiveFrom.
  // This is the cycle's true anchor — every subsequent visit is
  // anchorDate + k*intervalDays for k = 0, 1, 2, ...
  const effectiveFrom = new Date(effectiveFromStr + "T00:00:00");
  const anchorDate = firstDayOfWeekOnOrAfter(effectiveFrom, dayOfWeek);

  const fromDate = new Date(fromDateStr + "T00:00:00");
  const endDate = new Date(fromDate);
  endDate.setDate(endDate.getDate() + weeksAhead * 7);

  // Smallest k such that anchorDate + k*intervalDays >= fromDate
  const dayMs = 86400000;
  const daysFromAnchor = Math.floor((fromDate.getTime() - anchorDate.getTime()) / dayMs);
  const kStart = daysFromAnchor <= 0 ? 0 : Math.ceil(daysFromAnchor / intervalDays);

  const dates: string[] = [];
  const cursor = new Date(anchorDate);
  cursor.setDate(cursor.getDate() + kStart * intervalDays);
  while (cursor < endDate) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return dates;
}

/**
 * Given a date and a target day-of-week (DB convention: 0=Mon..6=Sun),
 * return the first date on or after `from` that falls on that DOW.
 */
function firstDayOfWeekOnOrAfter(from: Date, dayOfWeek: number): Date {
  // JS getDay(): 0=Sun..6=Sat. DB: 0=Mon..6=Sun.
  const targetJsDow = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const result = new Date(from);
  const currentJsDow = result.getDay();
  const daysUntil = (targetJsDow - currentJsDow + 7) % 7;
  result.setDate(result.getDate() + daysUntil);
  return result;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
