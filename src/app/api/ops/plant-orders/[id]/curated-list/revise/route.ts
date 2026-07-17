import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsRole } from "@/lib/auth/ops-auth";
import { reviseShortlist } from "@/lib/services/shortlists";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/ops/plant-orders/[id]/curated-list/revise
// Rehydrate the draft from the latest version so the horticulturist can edit and
// re-send after the customer has already seen a version.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOpsRole(request, ["admin", "horticulturist"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("plant_orders")
    .select("id, status, curated_shortlist_id")
    .eq("id", id)
    .single();
  if (orderError) {
    if (orderError.code === "PGRST116") return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order.curated_shortlist_id) {
    return NextResponse.json({ error: "No curated list exists for this order." }, { status: 400 });
  }
  if (!["interested", "finalizing"].includes(order.status)) {
    return NextResponse.json(
      { error: "The curated list is locked once the order leaves 'interested' / 'finalizing'." },
      { status: 422 }
    );
  }

  const result = await reviseShortlist(supabase, order.curated_shortlist_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: { success: true } });
}
