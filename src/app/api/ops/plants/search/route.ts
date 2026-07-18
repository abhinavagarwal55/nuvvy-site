import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/plants/search?q=tulsi
// Ops-gated (gardener 403). Searches name OR scientific_name and returns the
// catalog attributes (category/light/price_band) the curated-list plant picker
// filters on. With no `q`, returns the full catalog (capped) so the picker can
// filter client-side — matching the legacy /internal/shortlists experience.
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("plants")
    .select("airtable_id, name, scientific_name, category, light, price_band, thumbnail_storage_url")
    .order("name", { ascending: true });

  if (q && q.length > 0) {
    const term = q.replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${term}%,scientific_name.ilike.%${term}%`).limit(50);
  } else {
    query = query.limit(1000);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
