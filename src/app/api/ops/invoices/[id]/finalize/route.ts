import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// POST /api/ops/invoices/[id]/finalize — finalize a draft invoice
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

  // Fetch invoice
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status, discount")
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

  if (invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft invoices can be finalized" },
      { status: 409 }
    );
  }

  // Recompute totals from items
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("total")
    .eq("invoice_id", id);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "Cannot finalize an invoice with no line items" },
      { status: 400 }
    );
  }

  const subtotal = items.reduce((sum, li) => sum + (li.total ?? 0), 0);
  const total = subtotal - (invoice.discount ?? 0);

  if (total <= 0) {
    return NextResponse.json(
      { error: "Cannot finalize an invoice with zero or negative total" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update({
      status: "finalized",
      subtotal,
      total,
      finalized_at: new Date().toISOString(),
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
    action: "invoice.finalized",
    targetTable: "invoices",
    targetId: id,
    metadata: { subtotal, total },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: updated });
}
