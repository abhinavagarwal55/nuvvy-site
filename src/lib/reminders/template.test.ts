/**
 * Tests for the reminder template builders.
 *
 * Uses Node's built-in test runner (`node:test` + `node:assert`) so it runs with
 * zero added dependencies — the repo has no vitest/jest configured. Run with:
 *   node --experimental-strip-types --test src/lib/reminders/template.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderReminderTemplate,
  buildFocusBlock,
  getRelativeDay,
  timeWindowPhrase,
  careActionLabel,
  parseStandardLines,
  DEFAULT_REMINDER_TEMPLATE,
} from "./template.ts";

describe("getRelativeDay", () => {
  it("today / tomorrow / weekday", () => {
    assert.equal(getRelativeDay("2026-06-13", "2026-06-13").label, "Today");
    assert.equal(getRelativeDay("2026-06-14", "2026-06-13").day, "tomorrow");
    assert.match(getRelativeDay("2026-06-16", "2026-06-13").day, /^[A-Z]/);
  });
});

describe("timeWindowPhrase", () => {
  it("inline window / start-only / empty (all leading-spaced)", () => {
    assert.equal(timeWindowPhrase("11:30", "12:30"), " between 11:30 AM – 12:30 PM");
    assert.equal(timeWindowPhrase("09:30", null), " at 9:30 AM");
    assert.equal(timeWindowPhrase(null, null), "");
  });
});

describe("buildFocusBlock", () => {
  it("numbers continuously across sources", () => {
    const block = buildFocusBlock(["Fertilizer line"], ["Special task"], ["Watering"]);
    assert.equal(block, "1. Fertilizer line\n2. Special task\n3. Watering");
  });
});

describe("renderReminderTemplate", () => {
  it("substitutes tokens and matches the sample shape (with care action)", () => {
    const msg = renderReminderTemplate(DEFAULT_REMINDER_TEMPLATE, {
      customer_name: "Abhinav",
      day: "tomorrow",
      time_window: timeWindowPhrase("09:30", null),
      focus_items: buildFocusBlock(
        ["Application of fertilizer and micronutrients"],
        [],
        parseStandardLines(undefined)
      ),
    });
    assert.ok(msg.includes("Hi Abhinav,"));
    assert.ok(msg.includes("scheduled for tomorrow at 9:30 AM."));
    assert.ok(msg.includes("During tomorrow's visit, we will focus on:"));
    assert.ok(msg.includes("1. Application of fertilizer and micronutrients"));
    assert.ok(msg.includes("2. Soil aeration and pruning of dried plant parts"));
  });

  it("pure-generic message when no care action / task (example 2), and no time", () => {
    const msg = renderReminderTemplate(DEFAULT_REMINDER_TEMPLATE, {
      customer_name: "there",
      day: "tomorrow",
      time_window: timeWindowPhrase(null, null), // ""
      focus_items: buildFocusBlock([], [], parseStandardLines(undefined)),
    });
    assert.ok(msg.includes("scheduled for tomorrow.")); // no trailing time, no stray token
    assert.ok(!msg.includes("{time_window}"));
    assert.ok(msg.includes("1. Soil aeration and pruning of dried plant parts"));
    assert.ok(msg.includes("2. Watering the plants and general cleanup"));
  });

  it("leaves unknown tokens literal", () => {
    assert.equal(
      renderReminderTemplate("Hi {customer_name} {oops}", { customer_name: "A" }),
      "Hi A {oops}"
    );
  });
});

describe("careActionLabel", () => {
  it("maps known, humanizes unknown", () => {
    assert.match(careActionLabel("fertilizer"), /fertilizer/i);
    assert.equal(careActionLabel("some_new_action"), "Some new action");
  });
});
