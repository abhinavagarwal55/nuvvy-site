import { z } from "zod";

/**
 * Customer Type — single source of truth for the
 * `care_plan | plant_only | ondemand` classification. See
 * nuvvy-customer-type-prd.md §7 and the On-Demand Service prompt.
 *
 * `care_plan` is the SUPERSET: a recurring-care subscriber who may also place
 * plant orders. `plant_only` is a transactional plant buyer with no
 * subscription, visits, care schedules, or billing. `ondemand` is a one-off
 * hourly-billed customer with no subscription (services + per-hour bills only).
 *
 * Import the enum + labels from here everywhere — never re-declare the string
 * literals or the labels.
 */
export const CUSTOMER_TYPES = ["care_plan", "plant_only", "ondemand"] as const;

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  care_plan: "Care Plan",
  plant_only: "Plant Order",
  ondemand: "On-demand",
};
