import { z } from "zod";
import { createCustomerSchema } from "@/lib/services/customers";

/**
 * Zod schemas + types for the Leads CRM. Source of truth for what fields exist
 * and how loose-by-intent the qualifiers blob is. See nuvvy-leads-crm-prd.md §3.
 *
 * DB state enum is exactly active | converted | closed. `converted` is internal
 * only — never written by the UI, only by the convert endpoint.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export const LEAD_STATES = ["active", "converted", "closed"] as const;
export const LEAD_SOURCES = [
  "customer_referral",
  "website_lead",
  "social_media",
  "other",
] as const;
export const LEAD_CLOSED_REASONS = [
  "outside_service_area",
  "pricing_too_high",
  "not_meeting_requirements",
  "other",
] as const;

export const leadStateSchema = z.enum(LEAD_STATES);
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const leadClosedReasonSchema = z.enum(LEAD_CLOSED_REASONS);

export type LeadState = z.infer<typeof leadStateSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadClosedReason = z.infer<typeof leadClosedReasonSchema>;

// ── Qualifiers (loose-by-intent jsonb) ───────────────────────────────────────
// All fields optional. Unknown keys are STRIPPED (not 400'd) so a future
// WhatsApp agent can write loose data without breaking the API. `.strip()` is
// Zod's default object behaviour; we set it explicitly for intent.

export const leadQualifiersSchema = z
  .object({
    direction: z.string().optional(),
    light: z.string().optional(),
    plant_count_range: z.enum(["0_20", "20_40", "40_plus"]).optional(),
    balcony_photo_received: z.boolean().optional(),
    current_setup: z.string().optional(),
    watering_responsibility: z.array(z.string()).optional(),
    experience: z.string().optional(),
  })
  .strip();

export type LeadQualifiers = z.infer<typeof leadQualifiersSchema>;

// ── Create ───────────────────────────────────────────────────────────────────

export const createLeadInputSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  name: z.string().optional(),
  source: leadSourceSchema.optional(),
  society_id: z.string().uuid().optional(),
  area: z.string().optional(),
  qualifiers: leadQualifiersSchema.optional(),
  notes: z.string().optional(),
  next_action: z.string().optional(),
  next_action_at: z.string().optional(), // YYYY-MM-DD (date)
});

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;

// ── Patch (state is NEVER patchable) ─────────────────────────────────────────
// Rejects any of the state-owned columns: those change only via the explicit
// close / reactivate / convert verb endpoints.

const FORBIDDEN_PATCH_KEYS = [
  "state",
  "converted_customer_id",
  "closed_reason",
  "closed_note",
  "closed_at",
  "converted_at",
] as const;

// NOTE: `notes` is intentionally NOT patchable — the narrative now lives in the
// append-only lead_notes timeline (POST /api/ops/leads/[id]/notes).
export const patchLeadInputSchema = z
  .object({
    name: z.string().nullable().optional(),
    source: leadSourceSchema.nullable().optional(),
    society_id: z.string().uuid().nullable().optional(),
    area: z.string().nullable().optional(),
    qualifiers: leadQualifiersSchema.optional(),
    next_action: z.string().nullable().optional(),
    next_action_at: z.string().nullable().optional(),
  })
  .strict()
  .refine(
    (val) => !FORBIDDEN_PATCH_KEYS.some((k) => k in (val as Record<string, unknown>)),
    { message: "State fields cannot be changed via PATCH" }
  );

export type PatchLeadInput = z.infer<typeof patchLeadInputSchema>;

// ── Close / Reactivate / Convert ─────────────────────────────────────────────

export const closeLeadInputSchema = z.object({
  closed_reason: leadClosedReasonSchema,
  closed_note: z.string().optional(),
});
export type CloseLeadInput = z.infer<typeof closeLeadInputSchema>;

export const reactivateLeadInputSchema = z.object({
  note: z.string().optional(),
});
export type ReactivateLeadInput = z.infer<typeof reactivateLeadInputSchema>;

// Convert payload IS the customer-create payload. Re-use the shared schema —
// do not duplicate customer fields here.
export const convertLeadInputSchema = createCustomerSchema;
export type ConvertLeadInput = z.infer<typeof convertLeadInputSchema>;

// A single timeline note.
export const createLeadNoteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty"),
});
export type CreateLeadNoteInput = z.infer<typeof createLeadNoteSchema>;

// ── Phone normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a phone string to E.164. Strips whitespace/dashes/parens/dots.
 * - Already E.164 (`+...`, 8–15 digits) → returned as-is.
 * - Bare 10-digit Indian number → prefixed with +91.
 * - Bare `91` + 10 digits (12 digits) → prefixed with +.
 * - `0` + 10 digits (leading trunk zero) → +91 + last 10.
 * Returns null if it cannot produce a valid E.164 number.
 */
export function normalizePhone(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith("+");
  // Keep digits only
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  if (hadPlus) {
    // Trust an explicit country code; validate E.164 length (8–15 digits).
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // 10-digit Indian mobile without country code
  if (digits.length === 10) return `+91${digits}`;
  // 91XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  // 0XXXXXXXXXX (national trunk prefix)
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;

  return null;
}
