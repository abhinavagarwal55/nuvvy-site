import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth/pin";

// GET — list all gardeners
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gardeners")
    .select("id, phone, is_active, join_date, notes, profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gardeners: data });
}

// POST — create gardener
// Body: { full_name, phone, pin, join_date?, notes? }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { full_name, phone, pin, join_date, notes } = body;

  if (!full_name || !phone || !pin) {
    return NextResponse.json(
      { error: "full_name, phone, and pin are required" },
      { status: 400 }
    );
  }
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 6 digits" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Check phone uniqueness
  const { data: existing } = await supabase
    .from("gardeners")
    .select("id")
    .eq("phone", phone)
    .single();
  if (existing) {
    return NextResponse.json(
      { error: "A gardener with this phone already exists" },
      { status: 409 }
    );
  }

  // Create a headless Supabase auth user (no real email — gardeners never use email login)
  const syntheticEmail = `gardener-${phone.replace(/\D/g, "")}@internal.nuvvy.in`;
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: { role: "gardener", phone },
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Create profile
  await supabase.from("profiles").insert({
    id: authUser.user.id,
    full_name,
    phone,
    role: "gardener",
  });

  // Hash PIN and create gardener record
  const pin_hash = await hashPin(pin);
  const { data: gardener, error: gardenerError } = await supabase
    .from("gardeners")
    .insert({
      profile_id: authUser.user.id,
      phone,
      pin_hash,
      join_date: join_date ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (gardenerError) {
    return NextResponse.json({ error: gardenerError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, gardener_id: gardener.id });
}
