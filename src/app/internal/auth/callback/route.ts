import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (typeof url !== "string" || url.length === 0) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    }

    if (typeof key !== "string" || key.length === 0) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    const cookieStore = await cookies();
    
    // Create server client with cookie handling for route handler
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });
    
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
