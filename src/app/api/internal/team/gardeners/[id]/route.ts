import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth/pin";

// PATCH — update gardener (name, notes, join_date, is_active, or reset PIN)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { full_name, pin, join_date, notes, is_active } = body;

  const supabase = getSupabaseAdmin();

  // Fetch current record to get profile_id
  const { data: gardener } = await supabase
    .from("gardeners")
    .select("id, profile_id")
    .eq("id", id)
    .single();
  if (!gardener) {
    return NextResponse.json({ error: "Gardener not found" }, { status: 404 });
  }

  // Update profile name if provided
  if (full_name && gardener.profile_id) {
    await supabase
      .from("profiles")
      .update({ full_name })
      .eq("id", gardener.profile_id);
  }

  // Build gardener update payload
  const updates: Record<string, unknown> = {};
  if (pin !== undefined && pin !== "") {
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be exactly 6 digits" },
        { status: 400 }
      );
    }
    updates.pin_hash = await hashPin(pin);
  }
  if (join_date !== undefined) updates.join_date = join_date;
  if (notes !== undefined) updates.notes = notes;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("gardeners")
      .update(updates)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
