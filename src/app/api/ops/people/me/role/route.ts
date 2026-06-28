import { NextRequest, NextResponse } from "next/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// GET /api/ops/people/me/role — returns the authenticated user's role + id,
// plus their scoped-billing flag (admin always true; gardener never).
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  let canAccessBilling = auth.role === "admin";
  if (auth.role === "horticulturist") {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("profiles")
      .select("can_access_billing")
      .eq("id", auth.userId)
      .single();
    canAccessBilling = data?.can_access_billing === true;
  }

  return NextResponse.json({
    data: {
      role: auth.role,
      user_id: auth.userId,
      can_access_billing: canAccessBilling,
    },
  });
}
