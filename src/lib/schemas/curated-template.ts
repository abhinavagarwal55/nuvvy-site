import { z } from "zod";

/**
 * Curated List Templates — a reusable, customer-agnostic collection of plants
 * and/or accessories. See nuvvy-curated-templates-prd.md. Each item is exactly
 * ONE of a plant or an accessory.
 *
 * Plant items may arrive as either `plant_id` (plants.id uuid) or `airtable_id`
 * (what PlantSelector emits) — the API resolves airtable_id → plants.id. Accessory
 * items arrive as `catalog_product_id` (catalog_products.id uuid).
 */

export const TEMPLATE_STATUSES = ["active", "inactive"] as const;
export const templateStatusSchema = z.enum(TEMPLATE_STATUSES);
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

// A template is either a PLANT template or an ACCESSORY template.
export const TEMPLATE_TYPES = ["plants", "accessories"] as const;
export const templateTypeSchema = z.enum(TEMPLATE_TYPES);
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const templateItemInputSchema = z
  .object({
    plant_id: z.string().uuid().optional(),
    airtable_id: z.string().optional(),
    catalog_product_id: z.string().uuid().optional(),
    quantity: z.number().int().positive().nullable().optional(),
    note: z.string().nullable().optional(),
    why_picked_for_balcony: z.string().nullable().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine(
    (v) => {
      const hasPlant = Boolean(v.plant_id) || Boolean(v.airtable_id);
      const hasAccessory = Boolean(v.catalog_product_id);
      return hasPlant !== hasAccessory; // exactly one kind
    },
    { message: "Each item must be exactly one of a plant or an accessory" }
  );

export type TemplateItemInput = z.infer<typeof templateItemInputSchema>;

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  type: templateTypeSchema.default("plants"),
  items: z.array(templateItemInputSchema).default([]),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  type: templateTypeSchema.optional(),
  items: z.array(templateItemInputSchema).default([]),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const patchTemplateSchema = z.object({
  status: templateStatusSchema,
});
