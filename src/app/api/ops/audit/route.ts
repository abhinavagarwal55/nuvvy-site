import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/audit?target_table=service_visits&target_id=xxx
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
  const targetTable = searchParams.get("target_table");
  const targetId = searchParams.get("target_id");

  if (!targetTable || !targetId) {
    return NextResponse.json(
      { error: "target_table and target_id are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, actor_role, metadata, created_at")
    .eq("target_table", targetTable)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
