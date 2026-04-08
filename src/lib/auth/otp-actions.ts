"use server";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";

export type ActionResult = { ok: boolean; message?: string; error?: string };

// Action 1: Send OTP
export async function sendOtp(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Check your email for a 6-digit code." };
}

// Action 2: Verify OTP
export async function verifyOtp(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const token = formData.get("token")?.toString().trim();
  if (!email || !token) return { ok: false, error: "Email and code are required" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: "Invalid or expired code. Request a new one." };
  return { ok: true };
}
