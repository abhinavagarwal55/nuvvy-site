import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import {
  resolveGardenerId,
  computeDeactivationImpact,
  type DeactivationImpact,
} from "@/lib/services/gardener-assignment";

const EMPTY_IMPACT: DeactivationImpact = {
  primary_customers: [],
  secondary_customers: [],
  future_service_count: 0,
  in_progress: [],
};

// GET /api/ops/people/[id]/deactivation-impact — admin only.
// [id] is a profiles.id. Returns the references that block deactivation.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: profileId } = await params;
  const supabase = getSupabaseAdmin();

  // Only gardeners carry assignment references. Non-gardener profiles → empty.
  const gardenerId = await resolveGardenerId(supabase, profileId);
  if (!gardenerId) {
    return NextResponse.json({ data: EMPTY_IMPACT });
  }

  const impact = await computeDeactivationImpact(supabase, gardenerId);
  return NextResponse.json({ data: impact });
}
