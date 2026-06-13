/**
 * Visit reminder message template + pure builders.
 * Mirrors src/lib/billing/template.ts. Edited copy lives in `system_config`;
 * the DEFAULT_* constants here are only the pre-first-save fallback.
 */

export const REMINDER_TEMPLATE_KEY = "reminder_whatsapp_template_v1";
export const REMINDER_STANDARD_LINES_KEY = "reminder_standard_focus_lines_v1";

/** Default frame. `{focus_items}` expands to a numbered block (see buildFocusBlock). */
export const DEFAULT_REMINDER_TEMPLATE = `🌿 Hi {customer_name}, reminder: your Nuvvy Garden Care visit is scheduled for {day}{time_window}.

During {day}'s visit, we will focus on:
{focus_items}`;

/** Default standard maintenance lines (newline-separated, one per line).
 *  These are the generic lines that appear in EVERY reminder, even when no
 *  care action is due (see example 2 in the spec discussion). */
export const DEFAULT_STANDARD_FOCUS_LINES = `Soil aeration and pruning of dried plant parts
Watering the plants and general cleanup`;

/** Friendly customer-facing phrasing per care_action_types.name. Code-owned. */
export const CARE_ACTION_LABELS: Record<string, string> = {
  fertilizer: "Application of fertilizer and micronutrients",
  pesticide: "Neem oil spray",
  fungicide: "Fungicide application to manage any fungal issues",
  soil_amendment: "Soil amendment and conditioning",
};

export const REMINDER_TEMPLATE_TOKEN_HELP: Array<{ token: string; description: string }> = [
  { token: "customer_name", description: "Customer's first name (falls back to 'there')" },
  { token: "day", description: '"today" / "tomorrow" / weekday, e.g. "Saturday"' },
  { token: "time_window", description: 'Inline time w/ leading space: " at 9:30 AM" / " between 11:30 AM – 12:30 PM" / "" if unset' },
  { token: "focus_items", description: "Auto-numbered list: care actions due + special tasks + standard lines" },
];

function humanizeCareAction(name: string): string {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function careActionLabel(typeName: string): string {
  return CARE_ACTION_LABELS[typeName] ?? humanizeCareAction(typeName);
}

/** "HH:MM[:SS]" → "11:30 AM". "" for falsy input. */
export function formatTime12(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Phrase for {time_window}, with a LEADING SPACE so it sits inline after {day}.
 *  Window → " between 11:30 AM – 12:30 PM"; start only → " at 9:30 AM"; none → "".
 *  (Empty is valid here — renderReminderTemplate substitutes "" rather than leaving the token.) */
export function timeWindowPhrase(start: string | null, end: string | null): string {
  if (start && end) return ` between ${formatTime12(start)} – ${formatTime12(end)}`;
  if (start) return ` at ${formatTime12(start)}`;
  return "";
}

export type RelativeDay = {
  /** Day heading/badge: "Today" | "Tomorrow" | "Saturday" | "16 Jun" */
  label: string;
  /** {day} token value: "today" | "tomorrow" | "Saturday" | "16 June" */
  day: string;
};

/** Relative-day for a YYYY-MM-DD vs a YYYY-MM-DD "today" (compared at midnight). */
export function getRelativeDay(scheduledDate: string, today: string): RelativeDay {
  const a = new Date(`${scheduledDate}T00:00:00`);
  const b = new Date(`${today}T00:00:00`);
  const diff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  if (diff === 0) return { label: "Today", day: "today" };
  if (diff === 1) return { label: "Tomorrow", day: "tomorrow" };
  if (diff >= 2 && diff <= 6) {
    const weekday = a.toLocaleDateString("en-IN", { weekday: "long" });
    return { label: weekday, day: weekday };
  }
  return {
    label: a.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    day: a.toLocaleDateString("en-IN", { day: "numeric", month: "long" }),
  };
}

/** Split the newline-separated standard-lines field into trimmed, non-empty lines. */
export function parseStandardLines(value: string | null | undefined): string[] {
  return (value ?? DEFAULT_STANDARD_FOCUS_LINES)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Build the continuously-numbered focus block. */
export function buildFocusBlock(
  careLines: string[],
  taskLines: string[],
  standardLines: string[]
): string {
  return [...careLines, ...taskLines, ...standardLines]
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");
}

export type ReminderTokens = {
  customer_name?: string;
  day?: string;
  time_window?: string;
  focus_items?: string;
};

/** Replace {token} placeholders.
 *  - Unknown token (not in `tokens`) → left literal so typos are visible (billing parity).
 *  - undefined / null value → left literal (treated as a missing value).
 *  - "" value → substituted as empty (a legitimately empty token, e.g. no time set). */
export function renderReminderTemplate(template: string, tokens: ReminderTokens): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in tokens)) return match;
    const v = (tokens as Record<string, unknown>)[key];
    if (v === undefined || v === null) return match;
    return String(v);
  });
}

/** Current date "YYYY-MM-DD" in IST, regardless of server TZ (billing parity). */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(
    ist.getUTCDate()
  ).padStart(2, "0")}`;
}
