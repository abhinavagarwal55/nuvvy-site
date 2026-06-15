import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/invoices/[id]/revert — admin only. PRD §6.4.
//   paid      → finalized (clears paid_at)  — to correct a paid record
//   finalized → draft     (clears finalized_at)
// ---------------------------------------------------------------------------
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

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let update: Record<string, unknown>;
  let toStatus: string;
  if (invoice.status === "paid") {
    toStatus = "finalized";
    update = { status: "finalized", paid_at: null };
  } else if (invoice.status === "finalized") {
    toStatus = "draft";
    update = { status: "draft", finalized_at: null };
  } else {
    return NextResponse.json(
      { error: "Only paid or finalized invoices can be reverted" },
      { status: 409 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.reverted",
    targetTable: "invoices",
    targetId: id,
    metadata: { from: invoice.status, to: toStatus },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
