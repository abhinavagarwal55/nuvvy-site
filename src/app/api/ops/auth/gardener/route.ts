import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { verifyPin } from "@/lib/auth/pin";

// POST /api/ops/auth/gardener
// Body: { phone: string, pin: string }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { phone, pin } = body;

  if (!phone || !pin) {
    return NextResponse.json({ error: "Phone and PIN required" }, { status: 400 });
  }

  const adminSupabase = getSupabaseAdmin();

  // 1. Look up gardener by phone
  const { data: gardener } = await adminSupabase
    .from("gardeners")
    .select("id, profile_id, pin_hash, is_active")
    .eq("phone", phone.trim())
    .single();

  if (!gardener) {
    return NextResponse.json({ error: "not_registered" }, { status: 404 });
  }
  if (!gardener.is_active) {
    return NextResponse.json(
      { error: "Account inactive. Contact your team." },
      { status: 403 }
    );
  }

  // 2. Verify PIN
  const isValid = await verifyPin(pin, gardener.pin_hash);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  // 3. Get gardener's synthetic email
  const { data: authUser } = await adminSupabase.auth.admin.getUserById(
    gardener.profile_id
  );
  if (!authUser?.user?.email) {
    return NextResponse.json({ error: "Failed to resolve user" }, { status: 500 });
  }

  // 4. Generate a one-time token server-side (no email sent — we intercept the OTP)
  const { data: linkData, error: linkError } =
    await adminSupabase.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });

  if (linkError || !linkData?.properties?.email_otp) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // 5. Verify the OTP via the SSR client — this writes session cookies to next/headers
  const ssrClient = await createServerSupabaseClient();
  const { error: verifyError } = await ssrClient.auth.verifyOtp({
    email: authUser.user.email,
    token: linkData.properties.email_otp,
    type: "email",
  });

  if (verifyError) {
    return NextResponse.json({ error: "Failed to establish session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
