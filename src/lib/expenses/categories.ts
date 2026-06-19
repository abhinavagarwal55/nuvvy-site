// Cost & Profitability Tracking — category taxonomy (PRD §3.1).
// One shared `expenses` ledger; visibility & UI routing are decided by category.

export const OPERATIONAL_CATEGORIES = [
  "garden_input",
  "gardener_transport",
  "plant_purchase",
  "plant_transport",
] as const;

export const PAYROLL_CATEGORIES = ["salary", "consultant", "overhead"] as const;

export type OperationalCategory = (typeof OPERATIONAL_CATEGORIES)[number];
export type PayrollCategory = (typeof PAYROLL_CATEGORIES)[number];
export type ExpenseCategory = OperationalCategory | PayrollCategory;

export type OperationalGroup = "inputs" | "plant_procurement";

const OPERATIONAL_SET: ReadonlySet<string> = new Set(OPERATIONAL_CATEGORIES);
const PAYROLL_SET: ReadonlySet<string> = new Set(PAYROLL_CATEGORIES);

export function isOperationalCategory(c: string): c is OperationalCategory {
  return OPERATIONAL_SET.has(c);
}

export function isPayrollCategory(c: string): c is PayrollCategory {
  return PAYROLL_SET.has(c);
}

/** Operational sub-grouping for the Expenses page totals strip. */
export function operationalGroup(c: OperationalCategory): OperationalGroup {
  return c === "garden_input" || c === "gardener_transport"
    ? "inputs"
    : "plant_procurement";
}

/** Human label for any expense category. */
export function categoryLabel(c: string): string {
  switch (c) {
    case "garden_input":
      return "Garden input";
    case "gardener_transport":
      return "Gardener transport";
    case "plant_purchase":
      return "Plant purchase";
    case "plant_transport":
      return "Plant transport";
    case "salary":
      return "Salary";
    case "consultant":
      return "Consultant";
    case "overhead":
      return "Overhead";
    default:
      return c;
  }
}
