/**
 * Tests for the series-shift planner (PRD: Reschedule with Cadence Shift).
 *
 * Uses Node's built-in test runner (`node:test` + `node:assert`) — the repo has
 * no vitest/jest. Run with:
 *   node --experimental-strip-types --test src/lib/services/series-shift.test.ts
 *
 * Reference calendar (all Tuesdays, verified by hand):
 *   Tue W1 = 2026-08-04, W2 = 08-11, W3 = 08-18, W4 = 08-25,
 *   W5 = 09-01, W6 = 09-08, W7 = 09-15, W8 = 09-22.
 * Slot weekday = DB 1 (Tuesday, 0=Mon..6=Sun).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planSeriesShift } from "./series-shift.ts";
import { computeOccurrences } from "./scheduling.ts";

const TUE = 1; // DB day_of_week

// Original fortnightly Tuesday series: W1, W3, W5, W7.
const FORTNIGHTLY_FUTURE = [
  { id: "v-w1", scheduled_date: "2026-08-04" }, // W1 (the visit being moved)
  { id: "v-w3", scheduled_date: "2026-08-18" }, // W3
  { id: "v-w5", scheduled_date: "2026-09-01" }, // W5
  { id: "v-w7", scheduled_date: "2026-09-15" }, // W7
];

function recurringDates(plan: { upcoming: { date: string; is_moved_visit: boolean }[] }) {
  return plan.upcoming.filter((u) => !u.is_moved_visit).map((u) => u.date);
}

describe("planSeriesShift — weekday is never changed by the shift", () => {
  it("Tue W1 → Tue W2 (+1 week): series lands on W2, W4, W6, W8", () => {
    const plan = planSeriesShift({
      slot: { day_of_week: TUE },
      visit: { id: "v-w1", scheduled_date: "2026-08-04" },
      newDate: "2026-08-11", // Tue W2
      visitFrequency: "fortnightly",
      futureScheduledVisits: FORTNIGHTLY_FUTURE,
    });

    assert.equal(plan.anchor, "2026-08-11"); // Tuesday of W2

    // Moved visit first, then the recurring series.
    assert.deepEqual(
      plan.upcoming.map((u) => u.date),
      ["2026-08-11", "2026-08-25", "2026-09-08", "2026-09-22"] // W2, W4, W6, W8
    );
    assert.equal(plan.upcoming[0].is_moved_visit, true);

    // Every visit stays on Tuesday.
    for (const u of plan.upcoming) assert.equal(u.weekday, "Tue");

    // Old odd-week visits removed.
    assert.deepEqual(
      plan.removed.map((r) => r.date),
      ["2026-08-18", "2026-09-01", "2026-09-15"] // W3, W5, W7
    );
  });

  it("Tue W1 → Thu W2 (off-weekday): only the moved visit is Thu; series stays Tue", () => {
    const plan = planSeriesShift({
      slot: { day_of_week: TUE },
      visit: { id: "v-w1", scheduled_date: "2026-08-04" },
      newDate: "2026-08-13", // Thu W2
      visitFrequency: "fortnightly",
      futureScheduledVisits: FORTNIGHTLY_FUTURE,
    });

    // Anchor snaps back to Tuesday of the moved visit's week.
    assert.equal(plan.anchor, "2026-08-11");

    assert.deepEqual(
      plan.upcoming.map((u) => u.date),
      ["2026-08-13", "2026-08-25", "2026-09-08", "2026-09-22"]
    );
    // The moved visit is off-weekday (Thu); the series returns to Tuesday.
    assert.equal(plan.upcoming[0].weekday, "Thu");
    assert.equal(plan.upcoming[0].is_moved_visit, true);
    for (const d of recurringDates(plan)) {
      // Next standing visit is Tue W4 (08-25), NOT Thu W4, NOT Tue W2.
      assert.notEqual(d, "2026-08-11");
    }
    for (const u of plan.upcoming.filter((u) => !u.is_moved_visit)) {
      assert.equal(u.weekday, "Tue");
    }
    assert.equal(recurringDates(plan)[0], "2026-08-25"); // Tue W4
  });

  it("Tue W1 → Mon W2 (earlier in week): anchor=Tue W2, moved visit Mon, series resumes Tue W4", () => {
    const plan = planSeriesShift({
      slot: { day_of_week: TUE },
      visit: { id: "v-w1", scheduled_date: "2026-08-04" },
      newDate: "2026-08-10", // Mon W2
      visitFrequency: "fortnightly",
      futureScheduledVisits: FORTNIGHTLY_FUTURE,
    });

    assert.equal(plan.anchor, "2026-08-11"); // still Tuesday of W2
    assert.equal(plan.upcoming[0].date, "2026-08-10");
    assert.equal(plan.upcoming[0].weekday, "Mon");
    assert.equal(plan.upcoming[0].is_moved_visit, true);

    // Anchor-week Tuesday (08-11) is claimed by the moved visit → not duplicated.
    assert.ok(!recurringDates(plan).includes("2026-08-11"));
    assert.equal(recurringDates(plan)[0], "2026-08-25"); // Tue W4
    for (const u of plan.upcoming.filter((u) => !u.is_moved_visit)) {
      assert.equal(u.weekday, "Tue");
    }
  });

  it("monthly (28d) Tue W1 → Tue +1wk: stays monthly on Tuesday", () => {
    const plan = planSeriesShift({
      slot: { day_of_week: TUE },
      visit: { id: "m-1", scheduled_date: "2026-08-04" },
      newDate: "2026-08-11",
      visitFrequency: "monthly",
      futureScheduledVisits: [
        { id: "m-1", scheduled_date: "2026-08-04" },
        { id: "m-2", scheduled_date: "2026-09-01" }, // +28d
        { id: "m-3", scheduled_date: "2026-09-29" }, // +56d
      ],
    });

    assert.equal(plan.anchor, "2026-08-11");
    // 28-day cadence: moved 08-11, then 09-08.
    assert.deepEqual(
      plan.upcoming.map((u) => u.date),
      ["2026-08-11", "2026-09-08"]
    );
    for (const u of plan.upcoming) assert.equal(u.weekday, "Tue");
    assert.deepEqual(
      plan.removed.map((r) => r.date),
      ["2026-09-01", "2026-09-29"]
    );
  });

  it("backward move (W3 → W2) excludes the moved visit from removed", () => {
    const plan = planSeriesShift({
      slot: { day_of_week: TUE },
      visit: { id: "v-w3", scheduled_date: "2026-08-18" }, // moving W3 backward
      newDate: "2026-08-11", // to Tue W2
      visitFrequency: "fortnightly",
      futureScheduledVisits: FORTNIGHTLY_FUTURE,
    });

    // W3's old date (08-18) is > newDate but it is the moved visit — not removed.
    assert.ok(!plan.removed.some((r) => r.id === "v-w3"));
    assert.deepEqual(
      plan.removed.map((r) => r.date),
      ["2026-09-01", "2026-09-15"] // W5, W7 only
    );
    assert.equal(plan.upcoming[0].date, "2026-08-11");
    assert.equal(recurringDates(plan)[0], "2026-08-25");
  });
});

// Durability (PRD §5.4 / §10): after a shift, the new active slot is anchored to
// the moved visit's week (Tue W2 = 2026-08-11). The nightly extend-services cron
// reads THAT effective_from and must extend only the NEW phase — old odd-week
// dates must never reappear at the 6-week horizon. The retired slot (Tue W1 =
// 2026-08-04) is inactive, so the cron skips it entirely.
describe("cron durability — extend-services generates only the new phase", () => {
  const NEW_ANCHOR = "2026-08-11"; // Tue W2 (new active slot's effective_from)
  const OLD_ANCHOR = "2026-08-04"; // Tue W1 (retired slot — never read by the cron)
  const TUE = 1;
  const dayMs = 86400000;
  const modDays = (a: string, b: string) =>
    Math.round(
      (new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / dayMs
    ) % 14;

  it("a cron run weeks later extends the even-week phase, never the old odd weeks", () => {
    // Simulate the cron running well after the shift (fromDate = a later 'today').
    const generated = computeOccurrences(TUE, 14, NEW_ANCHOR, "2026-09-20", 6);

    assert.ok(generated.length > 0);
    // The old phase (odd weeks) = OLD_ANCHOR + k·14. Build that set over the window.
    const oldPhase = new Set(
      computeOccurrences(TUE, 14, OLD_ANCHOR, "2026-09-20", 6)
    );
    for (const d of generated) {
      // Every generated date is on the new phase: (d - NEW_ANCHOR) % 14 == 0.
      assert.equal(modDays(d, NEW_ANCHOR), 0, `${d} is off the new phase`);
      // And exactly one week out of phase with the old cadence — never an old date.
      assert.ok(!oldPhase.has(d), `${d} reappeared from the OLD phase`);
      assert.equal(Math.abs(modDays(d, OLD_ANCHOR)), 7, `${d} is not 1 week off old phase`);
    }
    // Concretely: continuation is Tue W8, W10, W12… (09-22, 10-06, 10-20).
    assert.deepEqual(generated, ["2026-09-22", "2026-10-06", "2026-10-20"]);
  });
});
