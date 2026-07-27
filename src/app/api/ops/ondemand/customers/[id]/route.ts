import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// GET /api/ops/ondemand/customers/:id — on-demand customer detail.
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
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: c, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone_number, email, unit_number, society_id, customer_type, source, last_fertilizer_applied_at, last_neem_applied_at, converted_to_subscription_at, created_at, societies(name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!c) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const society = c.societies as unknown as { name: string } | null;

  return NextResponse.json({
    data: {
      id: c.id,
      name: c.name,
      society: society?.name ?? null,
      apartment_number: c.unit_number,
      mobile: c.phone_number,
      email: c.email,
      customer_type: c.customer_type,
      source: c.source,
      last_fertilizer_applied_at: c.last_fertilizer_applied_at,
      last_neem_applied_at: c.last_neem_applied_at,
      converted_to_subscription_at: c.converted_to_subscription_at,
      created_at: c.created_at,
    },
  });
}
