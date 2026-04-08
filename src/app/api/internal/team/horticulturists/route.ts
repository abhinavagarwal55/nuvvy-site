import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// GET — list all horticulturists
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("horticulturists")
    .select("id, email, is_active, join_date, notes, profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ horticulturists: data });
}

// POST — create horticulturist
// Body: { full_name, email, join_date?, notes? }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { full_name, email, join_date, notes } = body;

  if (!full_name || !email) {
    return NextResponse.json(
      { error: "full_name and email are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Create Supabase auth user — they'll sign in via email OTP, no password needed
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "horticulturist" },
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Create profile
  await supabase.from("profiles").insert({
    id: authUser.user.id,
    full_name,
    role: "horticulturist",
  });

  // Create horticulturist record
  const { data: horti, error } = await supabase
    .from("horticulturists")
    .insert({
      profile_id: authUser.user.id,
      email,
      join_date: join_date ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, horticulturist_id: horti.id });
}
