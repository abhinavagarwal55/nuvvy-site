import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/internal/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Handle missing code
  if (!code) {
    return NextResponse.redirect(
      new URL("/internal/login?error=missing_code", request.url)
    );
  }

  try {
    // Use SSR client for cookie-based session management
    const supabase = await createServerSupabaseClient();
    
    // Exchange the code for a session (this will set cookies via setAll)
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Auth callback error:", exchangeError);
      return NextResponse.redirect(
        new URL(`/internal/login?error=${encodeURIComponent(exchangeError.message)}`, request.url)
      );
    }

    // Success - redirect to internal dashboard
    // Cookies are already set via cookieStore.set() above
    return NextResponse.redirect(new URL("/internal", request.url));
  } catch (err) {
    console.error("Auth callback exception:", err);
    return NextResponse.redirect(
      new URL(
        `/internal/login?error=${encodeURIComponent(
          err instanceof Error ? err.message : "Unknown error"
        )}`,
        request.url
      )
    );
  }
}
