import { z } from "zod";

/**
 * Zod schema for Nuvvy homepage content.
 * This is the single source of truth for homepage content structure.
 * Content is stored as JSONB in Supabase and edited via internal tool.
 */

// ============================================================================
// Shared Schemas
// ============================================================================

const HeroSchema = z.object({
  id: z.string().min(1, "Hero ID is required"),
  heading: z.string().min(1).max(200, "Heading must be 200 characters or less"),
  subheading: z.string().min(1).max(300, "Subheading must be 300 characters or less"),
  imageUrl: z.string().url("Image URL must be valid"),
  order: z.number().int().min(0),
});

const IconTypeSchema = z.enum(["check", "warning", "cross"]);

// ============================================================================
// Section Schemas
// ============================================================================

const HeroSectionSchema = z.object({
  heroes: z
    .array(HeroSchema)
    .max(4, "Maximum 4 heroes allowed")
    .min(1, "At least 1 hero is required"),
});

const HorticulturistCareSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  bullets: z
    .array(
      z.object({
        boldText: z.string().min(1).max(50, "Bold text must be 50 characters or less"),
        restText: z.string().min(1).max(200, "Rest text must be 200 characters or less"),
      })
    )
    .length(3, "Exactly 3 bullets are required"),
});

const CompareRowSchema = z.object({
  label: z.string().min(1).max(100, "Label must be 100 characters or less"),
  regular: z.object({
    type: IconTypeSchema,
    text: z.string().min(1).max(150, "Text must be 150 characters or less"),
  }),
  nuvvy: z.object({
    type: IconTypeSchema,
    text: z.string().min(1).max(150, "Text must be 150 characters or less"),
  }),
});

const CompareNuvvyCareSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  rows: z.array(CompareRowSchema).length(6, "Exactly 6 comparison rows are required"),
});

const CareVisitStepSchema = z.object({
  stepNumber: z.number().int().min(1).max(5),
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  description: z.string().min(1).max(200, "Description must be 200 characters or less"),
  imageUrl: z.string().url("Image URL must be valid"),
});

const NuvvyCareVisitSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  steps: z.array(CareVisitStepSchema).length(5, "Exactly 5 steps are required"),
});

const TransformationImageSchema = z.object({
  imageUrl: z.string().url("Image URL must be valid"),
  caption: z.string().max(200, "Caption must be 200 characters or less").optional(),
});

const SeeTheDifferenceSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  images: z.array(TransformationImageSchema).min(1, "At least 1 image is required"),
});

const PricingTierSchema = z.object({
  label: z.string().min(1).max(50, "Label must be 50 characters or less"),
  pricePrimary: z.number().positive("Price must be positive"),
  priceSecondary: z.number().positive("Secondary price must be positive").nullable(),
  frequencyPrimary: z.string().min(1).max(50, "Frequency must be 50 characters or less"),
  frequencySecondary: z.string().max(50, "Secondary frequency must be 50 characters or less").nullable(),
});

const PricingSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  description: z.string().min(1).max(300, "Description must be 300 characters or less"),
  tiers: z.array(PricingTierSchema).length(3, "Exactly 3 pricing tiers are required"),
});

const ExpertLedPlantSelectionSchema = z.object({
  heroes: z
    .array(HeroSchema)
    .max(4, "Maximum 4 heroes allowed")
    .min(1, "At least 1 hero is required"),
});

const MostPopularPlantsSchema = z.object({
  title: z.string().min(1).max(100, "Title must be 100 characters or less"),
  plantIds: z.array(z.string().min(1, "Plant ID cannot be empty")).min(1, "At least 1 plant ID is required"),
});

const SocialProofSchema = z.object({
  headline: z.string().min(1).max(200, "Headline must be 200 characters or less"),
  subtext: z.string().min(1).max(200, "Subtext must be 200 characters or less"),
});

// ============================================================================
// Main Homepage Schema
// ============================================================================

export const HomepageSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  heroSection: HeroSectionSchema,
  horticulturistCare: HorticulturistCareSchema,
  compareNuvvyCare: CompareNuvvyCareSchema,
  nuvvyCareVisit: NuvvyCareVisitSchema,
  seeTheDifference: SeeTheDifferenceSchema,
  pricing: PricingSchema,
  expertLedPlantSelection: ExpertLedPlantSelectionSchema,
  mostPopularPlants: MostPopularPlantsSchema,
  socialProof: SocialProofSchema,
});

export type HomepageContent = z.infer<typeof HomepageSchema>;
