import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/care-action-types — list all care action types (for onboarding)
export async function GET(request: NextRequest) {
  try {
    await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
