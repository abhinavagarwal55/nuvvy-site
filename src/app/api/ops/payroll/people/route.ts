import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";

// GET /api/ops/payroll/people — admin only.
// Active People (profiles) WITHOUT an active recurring comp master, for the
// "Add salary for an existing person" picker.
export async function GET(request: NextRequest) {
  try {
    await requireOpsRole(request, ["admin"]);
  } catch (res) {
    return res as Response;
  }

  const supabase = getSupabaseAdmin();

  const { data: people, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["admin", "horticulturist", "gardener"])
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Exclude anyone who already has an active comp master.
  const { data: masters, error: masterErr } = await supabase
    .from("staff_compensation")
    .select("payee_profile_id")
    .eq("is_active", true)
    .not("payee_profile_id", "is", null);

  if (masterErr)
    return NextResponse.json({ error: masterErr.message }, { status: 500 });

  const taken = new Set(
    (masters ?? []).map((m) => m.payee_profile_id as string)
  );
  const available = (people ?? []).filter((p) => !taken.has(p.id as string));

  return NextResponse.json({ data: { people: available } });
}
