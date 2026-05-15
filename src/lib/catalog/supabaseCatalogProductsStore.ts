import { createClient } from "@supabase/supabase-js";
import type {
  CatalogProduct,
  CatalogProductCategory,
} from "./catalogProductTypes";

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ListAccessoriesArgs = {
  category?: CatalogProductCategory | null;
  q?: string | null;
  sort?: "curated" | "price_asc" | "price_desc" | null;
};

/**
 * Public listing of active accessories for /plantcatalog.
 * Uses the anon Supabase client; RLS policy
 * `catalog_products_public_read` permits SELECT where status='active'.
 */
export async function listActiveAccessoriesFromSupabase(
  args: ListAccessoriesArgs = {}
): Promise<CatalogProduct[]> {
  const s = anonClient();
  let query = s.from("catalog_products").select("*").eq("status", "active");
  if (args.category) query = query.eq("category", args.category);
  if (args.q && args.q.trim()) {
    const term = args.q.trim().replace(/[%]/g, "");
    query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
  }
  switch (args.sort) {
    case "price_asc":
      query = query.order("price_inr", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price_inr", { ascending: false, nullsFirst: false });
      break;
    case "curated":
    default:
      query = query
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
  }
  const { data, error } = await query;
  if (error) {
    console.error("listActiveAccessoriesFromSupabase failed:", error.message);
    return [];
  }
  return (data ?? []) as CatalogProduct[];
}
