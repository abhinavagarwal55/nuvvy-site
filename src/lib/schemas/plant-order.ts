import { z } from "zod";

/**
 * Plant Order Pipeline — single source of truth for the two decoupled status
 * layers. See nuvvy-plant-order-pipeline-prd.md §3 / §4.
 *
 *   • Order pipeline  (plant_orders.status)      — customer intent, operator-driven.
 *   • Item procurement (plant_order_items.status) — logistics only, never drives
 *     the pipeline. Item install fact lives in installed_at, NOT in this enum.
 *
 * Import enums, labels, and the transition map from here — do not scatter status
 * string literals across routes/components.
 */

// ── Order pipeline ───────────────────────────────────────────────────────────

export const PLANT_ORDER_STATUSES = [
  "interested",
  "finalizing",
  "confirmed",
  "scheduled",
  "installed",
  "invoiced",
  "no_longer_interested",
] as const;

export const plantOrderStatusSchema = z.enum(PLANT_ORDER_STATUSES);
export type PlantOrderStatus = (typeof PLANT_ORDER_STATUSES)[number];

export const PLANT_ORDER_STATUS_LABELS: Record<PlantOrderStatus, string> = {
  interested: "Interested",
  finalizing: "Finalizing",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  installed: "Installed",
  invoiced: "Invoiced",
  no_longer_interested: "No longer interested",
};

// Terminal states — nothing advances out of these.
export const TERMINAL_ORDER_STATUSES: PlantOrderStatus[] = ["invoiced", "no_longer_interested"];

// Live states — the pre-terminal pipeline (used by the "Active" / follow-up views).
export const LIVE_ORDER_STATUSES: PlantOrderStatus[] = PLANT_ORDER_STATUSES.filter(
  (s) => !TERMINAL_ORDER_STATUSES.includes(s)
);

/**
 * Allowed forward transitions (manual, operator-driven — PRD §3). Every live
 * state may also exit to `no_longer_interested`. No auto-advance from logistics.
 */
export const ORDER_TRANSITIONS: Record<PlantOrderStatus, PlantOrderStatus[]> = {
  interested: ["finalizing", "confirmed", "no_longer_interested"],
  finalizing: ["confirmed", "no_longer_interested"],
  confirmed: ["scheduled", "no_longer_interested"],
  scheduled: ["installed", "no_longer_interested"],
  installed: ["invoiced", "no_longer_interested"],
  invoiced: [],
  no_longer_interested: [],
};

export function canTransition(from: PlantOrderStatus, to: PlantOrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Close reasons (only when status = no_longer_interested) ───────────────────

export const ORDER_CLOSED_REASONS = [
  "declined",
  "went_cold",
  "not_feasible",
  "wrong_timing",
] as const;

export const orderClosedReasonSchema = z.enum(ORDER_CLOSED_REASONS);
export type OrderClosedReason = (typeof ORDER_CLOSED_REASONS)[number];

export const ORDER_CLOSED_REASON_LABELS: Record<OrderClosedReason, string> = {
  declined: "Declined",
  went_cold: "Went cold",
  not_feasible: "Not feasible",
  wrong_timing: "Wrong timing",
};

// ── Item procurement (logistics only) ────────────────────────────────────────

export const PLANT_ORDER_ITEM_STATUSES = [
  "pending",
  "on_trip",
  "procured",
  "partial",
  "deferred",
  "cancelled",
] as const;

export const plantOrderItemStatusSchema = z.enum(PLANT_ORDER_ITEM_STATUSES);
export type PlantOrderItemStatus = (typeof PLANT_ORDER_ITEM_STATUSES)[number];

export const PLANT_ORDER_ITEM_STATUS_LABELS: Record<PlantOrderItemStatus, string> = {
  pending: "Pending",
  on_trip: "On trip",
  procured: "Procured",
  partial: "Partial",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

export const REQUEST_SOURCES = ["customer_requested", "replacement"] as const;
export const requestSourceSchema = z.enum(REQUEST_SOURCES);

// Provenance of a line item: hand-entered by ops ('manual', the default) or
// materialized from a confirmed curated plant list ('curated'). Both coexist on
// an order; reconcile-on-reconfirm only touches non-procured 'curated' rows.
export const PLANT_ORDER_ITEM_SOURCES = ["manual", "curated"] as const;
export const plantOrderItemSourceSchema = z.enum(PLANT_ORDER_ITEM_SOURCES);
export type PlantOrderItemSource = (typeof PLANT_ORDER_ITEM_SOURCES)[number];

// ── Create / update payloads ─────────────────────────────────────────────────

const orderItemInputSchema = z.object({
  plant_id: z.string().optional(),
  plant_name: z.string().min(1),
  quantity: z.number().int().min(1),
  note: z.string().optional(),
});

// Stages an order can be created at (the early, pre-procurement pipeline). The
// operator picks the starting stage; `confirmed` still requires ≥1 line item
// (enforced in the route — FD-10).
export const CREATABLE_ORDER_STATUSES = ["interested", "finalizing", "confirmed"] as const;
export const creatableOrderStatusSchema = z.enum(CREATABLE_ORDER_STATUSES);

// An order may be created at `interested` with ZERO line items (FD-10).
export const createPlantOrderSchema = z.object({
  customer_id: z.string().uuid(),
  items: z.array(orderItemInputSchema).default([]),
  status: creatableOrderStatusSchema.default("interested"),
  due_date: z.string().optional(), // YYYY-MM-DD, default today+10
  request_source: requestSourceSchema.default("customer_requested"),
  notes: z.string().optional(),
  next_follow_up_at: z.string().nullable().optional(),
  shortlist_version_id: z.string().uuid().nullable().optional(),
});
export type CreatePlantOrderInput = z.infer<typeof createPlantOrderSchema>;

/**
 * PUT payload — drives manual pipeline transitions + follow-up + intent edits.
 * `status` is optional (a PUT may only touch the follow-up date or items).
 * Transition legality + the "confirmed needs ≥1 item" + "no_longer_interested
 * needs closed_reason" rules are enforced in the route against current state.
 */
export const updatePlantOrderSchema = z.object({
  status: plantOrderStatusSchema.optional(),
  closed_reason: orderClosedReasonSchema.nullable().optional(),
  next_follow_up_at: z.string().nullable().optional(),
  shortlist_version_id: z.string().uuid().nullable().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  request_source: requestSourceSchema.optional(),
  items: z.array(orderItemInputSchema).optional(),
});
export type UpdatePlantOrderInput = z.infer<typeof updatePlantOrderSchema>;

// A single append-only timeline note (mirrors the Leads notes pattern).
export const createPlantOrderNoteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty"),
});
export type CreatePlantOrderNoteInput = z.infer<typeof createPlantOrderNoteSchema>;
