import { z } from "zod";

export type CatalogProductCategory =
  | "pot"
  | "planter_box"
  | "grow_light"
  | "tool"
  | "soil_input"
  | "other";

export type CatalogProductStatus = "draft" | "active" | "unavailable" | "inactive";

export type CatalogProductSource = "amazon_affiliate" | "nuvvy_internal" | "other";

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  category: CatalogProductCategory;
  source: CatalogProductSource;
  amazon_asin: string | null;
  amazon_url: string | null;
  price_inr: number | null;
  price_snapshot_at: string | null;
  image_url: string | null;
  image_storage_url: string | null;
  thumbnail_url: string | null;
  thumbnail_storage_url: string | null;
  brand: string | null;
  attributes: Record<string, unknown>;
  status: CatalogProductStatus;
  display_order: number | null;
  notes_internal: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

const categoryEnum = z.enum([
  "pot",
  "planter_box",
  "grow_light",
  "tool",
  "soil_input",
  "other",
]);

const statusEnum = z.enum(["draft", "active", "unavailable", "inactive"]);

const sourceEnum = z.enum(["amazon_affiliate", "nuvvy_internal", "other"]);

export const catalogProductCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    category: categoryEnum,
    description: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    source: sourceEnum.optional().default("amazon_affiliate"),
    amazon_asin: z.string().trim().nullable().optional(),
    amazon_url: z.string().trim().url().nullable().optional(),
    price_inr: z.number().int().nonnegative().nullable().optional(),
    price_snapshot_at: z.string().nullable().optional(),
    image_url: z.string().url().nullable().optional(),
    image_storage_url: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    thumbnail_storage_url: z.string().nullable().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    display_order: z.number().int().nullable().optional(),
    notes_internal: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.source !== "amazon_affiliate" ||
      (v.amazon_asin && v.amazon_asin.length > 0) ||
      (v.amazon_url && v.amazon_url.length > 0),
    {
      message: "Amazon ASIN or URL is required for affiliate products",
      path: ["amazon_asin"],
    }
  );

export const catalogProductUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: categoryEnum.optional(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  source: sourceEnum.optional(),
  amazon_asin: z.string().trim().nullable().optional(),
  amazon_url: z.string().trim().url().nullable().optional(),
  price_inr: z.number().int().nonnegative().nullable().optional(),
  price_snapshot_at: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  image_storage_url: z.string().nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
  thumbnail_storage_url: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  status: statusEnum.optional(),
  display_order: z.number().int().nullable().optional(),
  notes_internal: z.string().nullable().optional(),
});

export type CatalogProductCreateInput = z.infer<typeof catalogProductCreateSchema>;
export type CatalogProductUpdateInput = z.infer<typeof catalogProductUpdateSchema>;
