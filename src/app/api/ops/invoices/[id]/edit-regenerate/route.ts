import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/invoices/[id]/edit-regenerate — reopen finalized invoice
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

  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (invoice.status !== "finalized") {
    return NextResponse.json(
      { error: "Only finalized invoices can be reopened for editing" },
      { status: 409 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update({
      status: "draft",
      finalized_at: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "invoice.reopened",
    targetTable: "invoices",
    targetId: id,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
