import type {
  CatalogProductCategory,
  CatalogProductStatus,
} from "./catalogProductTypes";

export const CATEGORY_LABELS: Record<CatalogProductCategory, string> = {
  pot: "Pots",
  planter_box: "Planter boxes",
  grow_light: "Grow lights",
  tool: "Tools",
  soil_input: "Soil & inputs",
  other: "Other",
};

export const CATEGORY_ORDER: CatalogProductCategory[] = [
  "pot",
  "planter_box",
  "grow_light",
  "tool",
  "soil_input",
  "other",
];

export const STATUS_LABELS: Record<CatalogProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  unavailable: "Unavailable",
  inactive: "Inactive",
};

export const STATUS_BADGE_CLS: Record<CatalogProductStatus, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  unavailable: "bg-amber-100 text-amber-800 border-amber-200",
  inactive: "bg-red-100 text-red-700 border-red-200",
};

export function formatPriceInr(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
}
