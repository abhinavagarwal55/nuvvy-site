import { z } from "zod";

/**
 * Customer Type — single source of truth for the `care_plan | plant_only`
 * classification. See nuvvy-customer-type-prd.md §7.
 *
 * `care_plan` is the SUPERSET: a recurring-care subscriber who may also place
 * plant orders. `plant_only` is a transactional plant buyer with no
 * subscription, visits, care schedules, or billing.
 *
 * Import the enum + labels from here everywhere — never re-declare the string
 * literals "care_plan"/"plant_only" or the labels "Care Plan"/"Plant Order".
 */
export const CUSTOMER_TYPES = ["care_plan", "plant_only"] as const;

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  care_plan: "Care Plan",
  plant_only: "Plant Order",
};
