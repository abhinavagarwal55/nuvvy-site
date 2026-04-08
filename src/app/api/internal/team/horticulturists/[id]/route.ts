import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// PATCH — update horticulturist (name, notes, join_date, is_active)
// Email cannot be changed — it's the auth identity
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { full_name, join_date, notes, is_active } = body;

  const supabase = getSupabaseAdmin();

  // Fetch current record to get profile_id
  const { data: horti } = await supabase
    .from("horticulturists")
    .select("id, profile_id")
    .eq("id", id)
    .single();
  if (!horti) {
    return NextResponse.json({ error: "Horticulturist not found" }, { status: 404 });
  }

  // Update profile name if provided
  if (full_name && horti.profile_id) {
    await supabase
      .from("profiles")
      .update({ full_name })
      .eq("id", horti.profile_id);
  }

  // Build horticulturist update payload
  const updates: Record<string, unknown> = {};
  if (join_date !== undefined) updates.join_date = join_date;
  if (notes !== undefined) updates.notes = notes;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("horticulturists")
      .update(updates)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
