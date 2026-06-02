/**
 * Billing message template — global WhatsApp draft used on the Billing page.
 *
 * Storage: `system_config` table, key = BILLING_TEMPLATE_KEY.
 * The template is a plain string with `{token}` placeholders that are replaced
 * at render time by `renderBillingTemplate`. If a token has no value, the
 * literal `{token}` is left in place so the issue is visible in the draft.
 *
 * Source of truth for available tokens lives here. If you add a new token,
 * extend `BillingTemplateTokens` and document it in BILLING_TEMPLATE_TOKEN_HELP.
 */

export const BILLING_TEMPLATE_KEY = "billing_whatsapp_template_v1";

/**
 * Default template — matches the wording approved by Harshita. Edited copy
 * lives in `system_config`; this is only used as a fallback before the first
 * save.
 */
export const DEFAULT_BILLING_TEMPLATE = `Hello {customer_name}, sharing the Nuvvy Garden Care — Monthly Service Details for {month_year} below.
Service Plan: {plan_frequency}
Amount: ₹{amount}
UPI ID - {upi_id}
Kindly share the screenshot once the payment is done. Thank you again for trusting Nuvvy with your garden 💚.`;

/**
 * Default UPI ID — overridable via env so it's not hard-coded in two places.
 */
export const DEFAULT_NUVVY_UPI_ID =
  process.env.NEXT_PUBLIC_NUVVY_UPI_ID || "9901153781@ptaxis";

export type BillingTemplateTokens = {
  customer_name: string;
  plan_frequency: string; // "Weekly" | "Fortnightly" | "Monthly" — display-cased
  amount: string | number;
  month_year: string; // e.g. "May 2026"
  upi_id?: string;
};

export const BILLING_TEMPLATE_TOKEN_HELP: Array<{
  token: keyof BillingTemplateTokens;
  description: string;
}> = [
  { token: "customer_name", description: "Customer first name or full name" },
  { token: "plan_frequency", description: "Weekly · Fortnightly · Monthly" },
  { token: "amount", description: "Invoice amount in rupees (number only)" },
  { token: "month_year", description: 'Billing month, e.g. "May 2026"' },
  { token: "upi_id", description: "UPI handle for payment" },
];

/**
 * Replace `{token}` placeholders with values. Unknown tokens and missing
 * values are left as-is so the user notices and can fix them in the draft.
 */
export function renderBillingTemplate(
  template: string,
  tokens: BillingTemplateTokens
): string {
  const merged: BillingTemplateTokens = {
    upi_id: DEFAULT_NUVVY_UPI_ID,
    ...tokens,
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (merged as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") return match;
    return String(value);
  });
}

/**
 * "May 2026" formatter for a YYYY-MM-DD or YYYY-MM string. Used to fill the
 * {month_year} token and to label the picker.
 */
export function formatMonthLabel(yyyyMm: string): string {
  // Accept "2026-05" or "2026-05-01"
  const [y, m] = yyyyMm.split("-");
  if (!y || !m) return yyyyMm;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * Display-case the plan's visit_frequency: "weekly" -> "Weekly".
 */
export function formatPlanFrequency(freq: string): string {
  if (!freq) return "";
  return freq.charAt(0).toUpperCase() + freq.slice(1);
}

/**
 * Returns the first and last day of the calendar month (YYYY-MM-DD).
 * `month` accepts "YYYY-MM" or "YYYY-MM-DD".
 */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) {
    throw new Error(`Invalid month: ${month}`);
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Current month as "YYYY-MM" in IST. We render in en-IN locale so this matches
 * what Harshita sees on the page.
 */
export function currentMonthKey(now: Date = new Date()): string {
  // Use IST (UTC+5:30) to stay consistent regardless of server TZ
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}
