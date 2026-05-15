import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_CATEGORIES = new Set([
  "pot",
  "planter_box",
  "grow_light",
  "tool",
  "soil_input",
  "other",
]);

// GET /api/internal/accessories/search?q=&category=&limit=
// Search-as-you-type for the "Add Accessory" modal. Active products only.
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const category = sp.get("category");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "20", 10) || 20, 1), 50);

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("catalog_products")
    .select(
      "id, name, brand, category, price_inr, price_snapshot_at, thumbnail_storage_url, thumbnail_url, image_storage_url, image_url, amazon_asin, amazon_url, status"
    )
    .eq("status", "active");

  if (category && VALID_CATEGORIES.has(category)) {
    query = query.eq("category", category);
  }
  if (q) {
    const term = q.replace(/[%]/g, "");
    query = query.or(
      `name.ilike.%${term}%,brand.ilike.%${term}%,amazon_asin.ilike.%${term}%`
    );
  }
  query = query.order("name", { ascending: true }).limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
