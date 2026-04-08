import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const UpsertSchema = z.object({
  care_action_type_id: z.string().uuid(),
  cycle_anchor_date: z.string(), // YYYY-MM-DD
});

// POST /api/ops/customers/[id]/care-schedules — add or update a care schedule
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
  const body = await request.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { care_action_type_id, cycle_anchor_date } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Check if schedule already exists for this customer + action type
  const { data: existing } = await supabase
    .from("customer_care_schedules")
    .select("id")
    .eq("customer_id", id)
    .eq("care_action_type_id", care_action_type_id)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from("customer_care_schedules")
      .update({
        cycle_anchor_date,
        next_due_date: cycle_anchor_date,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Create new
  const { data, error } = await supabase
    .from("customer_care_schedules")
    .insert({
      customer_id: id,
      care_action_type_id,
      cycle_anchor_date,
      next_due_date: cycle_anchor_date,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
