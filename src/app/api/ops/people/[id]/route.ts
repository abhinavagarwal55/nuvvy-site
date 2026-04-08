import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const UpdatePersonSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().optional(),
});

// PUT /api/ops/people/[id] — update name/phone/email (admin only)
export async function PUT(
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
  const body = await request.json();
  const parsed = UpdatePersonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Update profile fields (name, phone)
  const profileUpdates: Record<string, unknown> = {};
  if (parsed.data.full_name !== undefined) profileUpdates.full_name = parsed.data.full_name;
  if (parsed.data.phone !== undefined) profileUpdates.phone = parsed.data.phone;

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Update email if provided (horticulturists + admins)
  if (parsed.data.email) {
    // Update Supabase auth email
    const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
      email: parsed.data.email,
    });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    // Update horticulturists table if applicable
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", id)
      .single();

    if (profile?.role === "horticulturist") {
      await supabase
        .from("horticulturists")
        .update({ email: parsed.data.email })
        .eq("profile_id", id);
    }
  }

  // Return updated profile
  const { data, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, status")
    .eq("id", id)
    .single();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
