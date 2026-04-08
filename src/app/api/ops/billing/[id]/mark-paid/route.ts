import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// POST /api/ops/billing/[id]/mark-paid
export async function POST(
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

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("bills")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: auth.userId,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Bill not found or already paid" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "bill.marked_paid",
    targetTable: "bills",
    targetId: id,
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
