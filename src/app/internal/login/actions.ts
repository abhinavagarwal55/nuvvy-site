"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

export type ActionResult = { ok: boolean; message?: string; error?: string };

export async function sendMagicLink(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = formData.get("email");

  // Validate email
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return { ok: false, error: "Please enter a valid email address" };
  }

  try {
    // Get current host and protocol from headers
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    
    // Determine callback URL
    const isDev = host.includes("localhost") || host.includes("127.0.0.1");
    const emailRedirectTo = isDev
      ? `${protocol}://${host}/internal/auth/callback`
      : "https://internal.nuvvy.in/internal/auth/callback";

    // Use SSR client (cookie-based) so PKCE verifier is stored in cookies
    const supabase = await createServerSupabaseClient();
    
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, message: "Check your email for the sign-in link." };
  } catch (err) {
    console.error("Error sending magic link:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send magic link",
    };
  }
}
