/**
 * Anchored care-schedule next-due computation.
 *
 * The cycle is defined by anchorDate + k*freqDays for k = 0, 1, 2, ...
 * The next due date is the smallest such date that is BOTH:
 *   (a) on or after today
 *   (b) strictly after last_done (when last_done is set)
 *
 * This keeps the cycle aligned to the anchor and never produces a date
 * earlier than today or earlier-or-equal to last_done.
 */
export function computeNextDueDate(
  anchorDateStr: string,
  lastDoneDateStr: string | null,
  freqDays: number,
  todayStr: string
): string {
  const DAY_MS = 86400000;
  const anchor = new Date(anchorDateStr + "T00:00:00Z").getTime();
  const today = new Date(todayStr + "T00:00:00Z").getTime();
  const lastDone = lastDoneDateStr
    ? new Date(lastDoneDateStr + "T00:00:00Z").getTime()
    : null;

  // Constraint A: anchor + k*freq >= today
  const daysAnchorToToday = Math.floor((today - anchor) / DAY_MS);
  let kForToday: number;
  if (daysAnchorToToday <= 0) {
    // Anchor is today or in the future — k=0 gives anchor itself, which is >= today
    kForToday = 0;
  } else {
    kForToday = Math.ceil(daysAnchorToToday / freqDays);
  }

  // Constraint B: anchor + k*freq > lastDone
  let kForLastDone = 0;
  if (lastDone !== null && lastDone >= anchor) {
    const daysAnchorToLastDone = Math.floor((lastDone - anchor) / DAY_MS);
    kForLastDone = Math.floor(daysAnchorToLastDone / freqDays) + 1;
  }

  const k = Math.max(kForToday, kForLastDone);
  const nextDueMs = anchor + k * freqDays * DAY_MS;
  const nextDue = new Date(nextDueMs);
  const yyyy = nextDue.getUTCFullYear();
  const mm = String(nextDue.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nextDue.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Today as YYYY-MM-DD in UTC. */
export function todayUtcStr(): string {
  return new Date().toISOString().split("T")[0];
}
