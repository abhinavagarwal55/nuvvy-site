/**
 * Plant-order invoice WhatsApp template + default Section-A service lines.
 *
 * Storage: `system_config` table.
 *   - PLANT_INVOICE_TEMPLATE_KEY      → the WA message string ({token} placeholders)
 *   - PLANT_INVOICE_SERVICE_LINES_KEY → JSON array string of default service-line descriptions
 *
 * Mirrors the care-plan billing template (`src/lib/billing/template.ts`) but with
 * its own token set (per nuvvy-plant-order-invoicing-prd.md §7). Unknown/empty
 * tokens are left literal so the issue is visible in the draft.
 */

import { DEFAULT_NUVVY_UPI_ID } from "@/lib/billing/template";

export const PLANT_INVOICE_TEMPLATE_KEY = "plant_invoice_whatsapp_template_v1";
export const PLANT_INVOICE_SERVICE_LINES_KEY =
  "plant_invoice_default_service_lines_v1";
export const PLANT_INVOICE_FOOTER_NOTE_KEY = "plant_invoice_footer_note_v1";

/** Default WA message — matches the migration seed. Fallback before first save. */
export const DEFAULT_PLANT_INVOICE_TEMPLATE = `Hi {customer_name}, thank you for ordering from Nuvvy! 🌿
Please find your plant order invoice ({invoice_number}) attached.
Total: ₹{total}
Kindly share a screenshot once payment is done. UPI - {upi_id}`;

/** Default explanatory footer note printed at the bottom of the PDF. Editable. */
export const DEFAULT_PLANT_INVOICE_FOOTER_NOTE =
  "**Installation and planting charges - cover the end-to-end process, including sourcing and delivery of plants, preparing a nutrient-rich soil mix (using inputs like garden soil, vermicompost, and cocopeat), repotting into appropriate planters, and a thorough clean-up of the space post-installation.";

/** Default Section-A lines — matches the migration seed (PRD §3.3). */
export const DEFAULT_PLANT_INVOICE_SERVICE_LINES: string[] = [
  "Consultation & Plants/Pots selection",
  "Installation & Planting charges",
  "Transportation and Input Materials Cost (Garden Soil, Vermi-Compost, Cocopeat, Perlite, Neem Powder)",
];

export type PlantInvoiceTemplateTokens = {
  customer_name: string;
  invoice_number: string;
  invoice_date: string; // e.g. "15 Jun 2026"
  total: string | number;
  upi_id?: string;
};

export const PLANT_INVOICE_TEMPLATE_TOKEN_HELP: Array<{
  token: keyof PlantInvoiceTemplateTokens;
  description: string;
}> = [
  { token: "customer_name", description: "Customer first name or full name" },
  { token: "invoice_number", description: "Invoice number, e.g. NUV-2026-0001" },
  { token: "invoice_date", description: 'Invoice date, e.g. "15 Jun 2026"' },
  { token: "total", description: "Grand total in rupees (number only)" },
  { token: "upi_id", description: "UPI handle for payment" },
];

/**
 * Replace `{token}` placeholders with values. Unknown tokens / missing values
 * are left as-is so the user notices and can fix them in the draft.
 */
export function renderPlantInvoiceTemplate(
  template: string,
  tokens: PlantInvoiceTemplateTokens
): string {
  const merged: PlantInvoiceTemplateTokens = {
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
 * Parse the stored service-lines JSON array. Returns the default set if the
 * stored value is missing, malformed, or not a non-empty array of strings.
 */
export function parseServiceLines(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_PLANT_INVOICE_SERVICE_LINES;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every((s) => typeof s === "string")
    ) {
      const cleaned = parsed.map((s) => s.trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned : DEFAULT_PLANT_INVOICE_SERVICE_LINES;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_PLANT_INVOICE_SERVICE_LINES;
}
