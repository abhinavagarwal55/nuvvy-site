import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TemplateItemInput } from "@/lib/schemas/curated-template";

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export type TemplateItemRow = {
  plant_id: string | null;
  catalog_product_id: string | null;
  quantity: number | null;
  note: string | null;
  why_picked_for_balcony: string | null;
  sort_order: number;
};

export type ResolveResult =
  | { ok: true; rows: TemplateItemRow[] }
  | { ok: false; status: number; error: string };

/**
 * Resolve raw template item inputs into DB rows: translate any `airtable_id`
 * (what PlantSelector emits) → plants.id (uuid), and assign a stable sort_order
 * (falling back to array order). Accessory items pass through by catalog_product_id.
 */
export async function resolveTemplateItemRows(
  supabase: Supabase,
  items: TemplateItemInput[]
): Promise<ResolveResult> {
  // Batch-resolve all airtable_ids up front.
  const airtableIds = [
    ...new Set(items.filter((i) => !i.plant_id && i.airtable_id).map((i) => i.airtable_id as string)),
  ];
  const airtableToUuid: Record<string, string> = {};
  if (airtableIds.length > 0) {
    const { data: plants } = await supabase
      .from("plants")
      .select("id, airtable_id")
      .in("airtable_id", airtableIds);
    (plants ?? []).forEach((p) => {
      if (p.airtable_id) airtableToUuid[p.airtable_id] = p.id;
    });
  }

  const rows: TemplateItemRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sort_order = item.sort_order ?? i;

    if (item.catalog_product_id) {
      rows.push({
        plant_id: null,
        catalog_product_id: item.catalog_product_id,
        quantity: item.quantity ?? null,
        note: item.note ?? null,
        why_picked_for_balcony: item.why_picked_for_balcony ?? null,
        sort_order,
      });
      continue;
    }

    const plantUuid = item.plant_id ?? (item.airtable_id ? airtableToUuid[item.airtable_id] : undefined);
    if (!plantUuid) {
      return { ok: false, status: 400, error: "A selected plant is not in the catalog." };
    }
    rows.push({
      plant_id: plantUuid,
      catalog_product_id: null,
      quantity: item.quantity ?? null,
      note: item.note ?? null,
      why_picked_for_balcony: item.why_picked_for_balcony ?? null,
      sort_order,
    });
  }

  return { ok: true, rows };
}

/** Shared select for template items with joined plant / catalog_product display data. */
export const TEMPLATE_ITEM_SELECT = `
  id, plant_id, catalog_product_id, quantity, note, why_picked_for_balcony, sort_order,
  plant:plants ( id, name, scientific_name, price_band, thumbnail_url, thumbnail_storage_url ),
  catalog_product:catalog_products ( id, name, brand, category, price_inr, status, thumbnail_url, thumbnail_storage_url, image_url, image_storage_url )
`;
