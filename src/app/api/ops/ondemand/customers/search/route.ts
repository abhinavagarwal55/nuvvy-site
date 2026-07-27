import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/ondemand/customers/search?q=:query
// Searches on-demand customers by society name, apartment (unit_number), or name.
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
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ data: [] });

  const supabase = getSupabaseAdmin();
  // Strip characters that would break an .or() filter / wildcard the pattern.
  const safe = q.replace(/[,%()*]/g, " ").trim();

  // Societies whose name matches → include their customers too. The dedicated
  // .ilike() method uses % wildcards.
  const { data: societies } = await supabase
    .from("societies")
    .select("id")
    .ilike("name", `%${safe}%`);
  const societyIds = (societies ?? []).map((s) => s.id);

  // NOTE: inside .or(), ilike wildcards are `*`, not `%` (raw PostgREST syntax).
  const orParts = [
    `name.ilike.*${safe}*`,
    `unit_number.ilike.*${safe}*`,
    `phone_number.ilike.*${safe}*`,
  ];
  if (societyIds.length > 0) {
    orParts.push(`society_id.in.(${societyIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone_number, unit_number, society_id, source, last_fertilizer_applied_at, last_neem_applied_at, created_at, societies(name)"
    )
    .eq("customer_type", "ondemand")
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((c) => c.id);

  // Last service date per customer (best-effort, for display).
  const lastServiceMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: visits } = await supabase
      .from("service_visits")
      .select("customer_id, scheduled_date")
      .in("customer_id", ids)
      .order("scheduled_date", { ascending: false });
    for (const v of visits ?? []) {
      if (!lastServiceMap[v.customer_id]) lastServiceMap[v.customer_id] = v.scheduled_date;
    }
  }

  const results = (data ?? []).map((c) => {
    const society = c.societies as unknown as { name: string } | null;
    return {
      id: c.id,
      name: c.name,
      society: society?.name ?? null,
      apartment_number: c.unit_number,
      mobile: c.phone_number,
      source: c.source,
      last_service_date: lastServiceMap[c.id] ?? null,
      last_fertilizer_applied_at: c.last_fertilizer_applied_at,
      last_neem_applied_at: c.last_neem_applied_at,
    };
  });

  return NextResponse.json({ data: results });
}
