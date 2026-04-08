import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/gardeners — list active gardeners (for slot assignment dropdown)
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

  const supabase = getSupabaseAdmin();
  const { data: gardeners, error } = await supabase
    .from("gardeners")
    .select("id, profile_id, phone, is_active")
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join profile names
  const profileIds = (gardeners ?? []).map((g) => g.profile_id).filter(Boolean);
  let nameMap: Record<string, string> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    nameMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
    );
  }

  const result = (gardeners ?? []).map((g) => ({
    id: g.id,
    profile_id: g.profile_id,
    name: g.profile_id ? nameMap[g.profile_id] ?? "Unknown" : "Unknown",
    phone: g.phone,
  }));

  return NextResponse.json({ data: result });
}
