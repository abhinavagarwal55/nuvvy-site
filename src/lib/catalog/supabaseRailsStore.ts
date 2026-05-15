import { createClient } from "@supabase/supabase-js";
import type { PlantListItem, PlantCategory, LightRequirement } from "@/lib/catalog";
import type { CatalogProduct } from "@/lib/catalog/catalogProductTypes";
import type { RailSegment } from "@/lib/catalog/railTypes";

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type PublicRail = {
  id: string;
  title: string;
  subtitle: string | null;
  segment: RailSegment;
  display_order: number;
  cta_label: string | null;
  cta_link: string | null;
};

export type PublicRailWithItems = PublicRail &
  ({ segment: "plants"; items: PlantListItem[] } | { segment: "accessories"; items: CatalogProduct[] });

/**
 * List active rails for a segment with items joined.
 * RLS policy `curated_rails_public_read` permits anon SELECT on
 * status='active' rows; the join is filtered via the items RLS policy.
 *
 * Items whose underlying plant is not procurable (or accessory is not
 * active) are dropped. Rails that end up with 0 items are dropped.
 */
export async function listActiveRailsForSegmentFromSupabase(
  segment: RailSegment
): Promise<PublicRailWithItems[]> {
  const s = anonClient();

  const { data: rails, error } = await s
    .from("curated_rails")
    .select("id, title, subtitle, segment, display_order, cta_label, cta_link")
    .eq("status", "active")
    .eq("segment", segment)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error || !rails || rails.length === 0) return [];

  const railIds = rails.map((r) => r.id);

  if (segment === "plants") {
    const { data: items } = await s
      .from("curated_rail_items")
      .select(`
        id,
        rail_id,
        position,
        plant:plants ( airtable_id, name, category, light, air_purifier, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url, price_band, horticulturist_notes, can_be_procured )
      `)
      .in("rail_id", railIds)
      .not("plant_id", "is", null)
      .order("position", { ascending: true });
    const itemsByRail: Record<string, PlantListItem[]> = {};
    for (const row of items ?? []) {
      const plant = row.plant as unknown as {
        airtable_id: string;
        name: string;
        category: string;
        light: string;
        air_purifier: boolean | null;
        thumbnail_storage_url: string | null;
        thumbnail_url: string | null;
        image_storage_url: string | null;
        image_url: string | null;
        price_band: string | null;
        horticulturist_notes: string | null;
        can_be_procured: boolean | null;
      } | null;
      if (!plant || !plant.can_be_procured) continue;
      const arr = (itemsByRail[row.rail_id] ??= []);
      arr.push({
        id: plant.airtable_id,
        name: plant.name,
        category: plant.category as PlantCategory,
        light: plant.light as LightRequirement,
        thumbnailUrl:
          plant.thumbnail_storage_url ||
          plant.thumbnail_url ||
          plant.image_storage_url ||
          plant.image_url ||
          undefined,
        imageUrl: plant.image_storage_url || plant.image_url || undefined,
        airPurifier: plant.air_purifier ?? undefined,
        price_band: plant.price_band ?? undefined,
        horticulturistNotes: plant.horticulturist_notes ?? null,
      });
    }
    return rails
      .map((r) => ({
        ...r,
        segment: "plants" as const,
        items: itemsByRail[r.id] ?? [],
      }))
      .filter((r) => r.items.length > 0);
  }

  // segment === "accessories"
  const { data: items } = await s
    .from("curated_rail_items")
    .select(`
      id,
      rail_id,
      position,
      catalog_product:catalog_products ( id, name, description, category, source, amazon_asin, amazon_url, price_inr, price_snapshot_at, image_url, image_storage_url, thumbnail_url, thumbnail_storage_url, brand, attributes, status, display_order, notes_internal, created_by, created_at, updated_by, updated_at )
    `)
    .in("rail_id", railIds)
    .not("catalog_product_id", "is", null)
    .order("position", { ascending: true });
  const itemsByRail: Record<string, CatalogProduct[]> = {};
  for (const row of items ?? []) {
    const cp = row.catalog_product as unknown as CatalogProduct | null;
    if (!cp || cp.status !== "active") continue;
    const arr = (itemsByRail[row.rail_id] ??= []);
    arr.push(cp);
  }
  return rails
    .map((r) => ({
      ...r,
      segment: "accessories" as const,
      items: itemsByRail[r.id] ?? [],
    }))
    .filter((r) => r.items.length > 0);
}
