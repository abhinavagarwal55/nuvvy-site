import { NextRequest, NextResponse } from "next/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/internal/plants/search?q=&limit=
// Returns active (can_be_procured=true) plants for the rails item picker.
// `id` is the real plants.id PK so it can be used directly as a FK.
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "20", 10) || 20, 1), 50);

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("plants")
    .select("id, airtable_id, name, scientific_name, price_band, thumbnail_url, thumbnail_storage_url")
    .eq("can_be_procured", true)
    .order("name", { ascending: true })
    .limit(limit);
  if (q) {
    const term = q.replace(/[%]/g, "");
    query = query.or(`name.ilike.%${term}%,scientific_name.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
