import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { verifyPin } from "@/lib/auth/pin";

/**
 * POST /api/ops/auth/gardener-token
 * Body: { token: string, pin: string }
 *
 * Authenticates a gardener using their unique URL login token + 4-digit PIN.
 * The token is the path segment from /ops/g/[token] — a 24-char high-entropy
 * nanoid stored on the gardeners table. It identifies the gardener without
 * exposing their phone or name in the URL.
 *
 * On success: writes Supabase session cookies and returns { ok: true }.
 * Caller redirects to /ops/visits/today.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, pin } = body as { token?: string; pin?: string };

  if (!token || !pin) {
    return NextResponse.json(
      { error: "Token and PIN are required" },
      { status: 400 }
    );
  }

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN must be 4 digits" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // 1. Look up gardener by login_token
  const { data: gardener } = await admin
    .from("gardeners")
    .select("id, profile_id, pin_hash, is_active, pin_version")
    .eq("login_token", token.trim())
    .single();

  if (!gardener) {
    // Deliberately vague — don't reveal whether the token exists
    return NextResponse.json(
      { error: "not_registered" },
      { status: 404 }
    );
  }

  if (!gardener.is_active) {
    return NextResponse.json(
      { error: "Account inactive. Contact your team." },
      { status: 403 }
    );
  }

  if (!gardener.pin_hash) {
    // Gardener exists but PIN hasn't been set yet by admin/horticulturist
    return NextResponse.json(
      { error: "PIN not set. Ask your team to set your PIN." },
      { status: 403 }
    );
  }

  // 2. Verify PIN (scrypt, timing-safe)
  const isValid = await verifyPin(pin, gardener.pin_hash);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  // 3. Resolve the gardener's synthetic Supabase auth user
  const { data: authUser } = await admin.auth.admin.getUserById(
    gardener.profile_id
  );
  if (!authUser?.user?.email) {
    console.error(`Gardener ${gardener.id} has no auth user — profile_id: ${gardener.profile_id}`);
    return NextResponse.json(
      { error: "Session setup failed. Contact your team." },
      { status: 500 }
    );
  }

  // 4. Generate a magic link OTP server-side (no email sent — we intercept it)
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });

  if (linkError || !linkData?.properties?.email_otp) {
    console.error("generateLink failed:", linkError);
    return NextResponse.json(
      { error: "Session setup failed. Try again." },
      { status: 500 }
    );
  }

  // 5. Verify the OTP via SSR client — this writes session cookies to next/headers
  // NOTE: Session duration uses Supabase project defaults (typically 1hr access + 1wk refresh).
  // HLD specifies 60-day gardener sessions — this requires either:
  //   (a) Configuring Supabase project JWT expiry in dashboard, or
  //   (b) V2 migration to custom JWT with explicit exp: +60days
  // For V1 with <10 gardeners, Supabase defaults with auto-refresh are acceptable.
  const ssrClient = await createServerSupabaseClient();
  const { error: verifyError } = await ssrClient.auth.verifyOtp({
    email: authUser.user.email,
    token: linkData.properties.email_otp,
    type: "email",
  });

  if (verifyError) {
    console.error("verifyOtp failed:", verifyError);
    return NextResponse.json(
      { error: "Session setup failed. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
