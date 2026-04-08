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
  fromDate: string; // YYYY-MM-DD — generate from this date onward
  weeksAhead?: number; // default 6
}

/**
 * Generate service visit rows for a slot.
 *
 * Idempotent: skips dates that already have a service for this slot.
 * Never touches past services.
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
    fromDate,
    weeksAhead = 6,
  } = input;

  const intervalDays = FREQ_DAYS[visitFrequency];
  if (!intervalDays) {
    throw new Error(`Unknown visit frequency: ${visitFrequency}`);
  }

  // Compute all occurrence dates within the window
  const dates = computeOccurrences(dayOfWeek, intervalDays, fromDate, weeksAhead);

  if (dates.length === 0) return 0;

  // Fetch existing services for this slot in the date range to ensure idempotency
  const { data: existing } = await supabase
    .from("service_visits")
    .select("scheduled_date")
    .eq("slot_id", slotId)
    .in("scheduled_date", dates);

  const existingDates = new Set((existing ?? []).map((e) => e.scheduled_date));

  // Filter to only new dates
  const newDates = dates.filter((d) => !existingDates.has(d));

  if (newDates.length === 0) return 0;

  const rows = newDates.map((date) => ({
    customer_id: customerId,
    subscription_id: subscriptionId,
    assigned_gardener_id: gardenerId,
    slot_id: slotId,
    scheduled_date: date,
    time_window_start: timeStart,
    time_window_end: timeEnd,
    status: "scheduled",
  }));

  const { error } = await supabase.from("service_visits").insert(rows);
  if (error) {
    throw new Error(`Failed to generate services: ${error.message}`);
  }

  return newDates.length;
}

/**
 * Compute visit dates for a given day-of-week and frequency.
 *
 * dayOfWeek: 0=Mon ... 6=Sun (matches DB convention)
 * intervalDays: 7 for weekly, 14 for fortnightly, 28 for monthly
 * fromDate: YYYY-MM-DD — first possible date
 * weeksAhead: generate up to this many weeks from fromDate
 */
function computeOccurrences(
  dayOfWeek: number,
  intervalDays: number,
  fromDate: string,
  weeksAhead: number
): string[] {
  const from = new Date(fromDate + "T00:00:00");
  const endDate = new Date(from);
  endDate.setDate(endDate.getDate() + weeksAhead * 7);

  // Find the first occurrence of dayOfWeek on or after fromDate
  // JS: 0=Sun, 1=Mon ... 6=Sat. DB: 0=Mon ... 6=Sun
  // Convert DB dayOfWeek to JS dayOfWeek
  const jsDow = dayOfWeek === 6 ? 0 : dayOfWeek + 1;

  const cursor = new Date(from);
  const currentJsDow = cursor.getDay();
  let daysUntilFirst = (jsDow - currentJsDow + 7) % 7;
  if (daysUntilFirst === 0 && cursor >= from) {
    // fromDate itself is a valid date if it matches
    daysUntilFirst = 0;
  }
  cursor.setDate(cursor.getDate() + daysUntilFirst);

  const dates: string[] = [];
  while (cursor < endDate) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + intervalDays);
  }

  return dates;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
