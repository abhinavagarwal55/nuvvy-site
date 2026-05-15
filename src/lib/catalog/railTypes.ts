import { z } from "zod";

export type RailSegment = "plants" | "accessories";
export type RailStatus = "draft" | "active" | "inactive";

export interface CuratedRail {
  id: string;
  title: string;
  subtitle: string | null;
  segment: RailSegment;
  status: RailStatus;
  display_order: number;
  cta_label: string | null;
  cta_link: string | null;
  notes_internal: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export const railCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    segment: z.enum(["plants", "accessories"]),
    subtitle: z.string().nullable().optional(),
    display_order: z.number().int().nullable().optional(),
    cta_label: z.string().nullable().optional(),
    cta_link: z.string().nullable().optional(),
    notes_internal: z.string().nullable().optional(),
  })
  .refine(
    (v) => {
      const hasLabel = Boolean(v.cta_label?.trim());
      const hasLink = Boolean(v.cta_link?.trim());
      return hasLabel === hasLink;
    },
    { message: "Both CTA label and CTA link must be set, or neither", path: ["cta_label"] }
  );

export const railUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    subtitle: z.string().nullable().optional(),
    status: z.enum(["draft", "active", "inactive"]).optional(),
    display_order: z.number().int().optional(),
    cta_label: z.string().nullable().optional(),
    cta_link: z.string().nullable().optional(),
    notes_internal: z.string().nullable().optional(),
    // segment intentionally excluded — immutable post-creation
  })
  .refine(
    (v) => {
      // Only validate CTA pairing when at least one CTA field is in the patch
      if (v.cta_label === undefined && v.cta_link === undefined) return true;
      const hasLabel = Boolean(v.cta_label?.trim());
      const hasLink = Boolean(v.cta_link?.trim());
      return hasLabel === hasLink;
    },
    { message: "Both CTA label and CTA link must be set, or neither", path: ["cta_label"] }
  );

export const railItemAddSchema = z
  .object({
    plant_id: z.string().uuid().optional(),
    catalog_product_id: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.plant_id) !== Boolean(v.catalog_product_id),
    { message: "Exactly one of plant_id or catalog_product_id is required" }
  );

export const railReorderSchema = z.object({
  ordered_rail_ids: z.array(z.string().uuid()).min(1),
});

export const itemReorderSchema = z.object({
  ordered_item_ids: z.array(z.string().uuid()).min(1),
});
