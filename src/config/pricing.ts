/**
 * Garden care pricing configuration
 * This is code-owned and not editable via CMS
 */

export const PRICING_TITLE = "Simple, all-inclusive pricing";
export const PRICING_SUBTITLE = "Once every 2 weeks visit";

export interface PricingTier {
  label: string;
  monthlyPrice?: number; // Price per month (optional for 40+ pots)
  perVisitPrice?: number; // Effective price per visit (monthly / 2)
  cadence?: string; // For 40+ pots, show cadence text instead of price
}

export const GARDEN_CARE_PRICING: PricingTier[] = [
  {
    label: "0–20 pots",
    monthlyPrice: 799,
    perVisitPrice: 400, // 799 / 2 = 399.5, rounded to 400
  },
  {
    label: "20–40 pots",
    monthlyPrice: 1099,
    perVisitPrice: 550, // 1099 / 2 = 549.5, rounded to 550
  },
  {
    label: "40+ pots",
    cadence: "Weekly & Bi-weekly plans available",
  },
];

export const PRICING_INCLUSIONS = [
  "Fertilizers and preventive pest control included",
  "Access to horticulturist guidance when needed",
  "Help with selecting the right plants for your balcony",
] as const;
