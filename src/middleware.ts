import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresh the Supabase session on every request.
 * This is CRITICAL — without it, the JWT expires and users get logged out,
 * especially on mobile Safari which aggressively suspends background tabs.
 *
 * The middleware reads the auth cookies, calls getUser() to trigger a token
 * refresh if needed, and writes any updated cookies back to the response.
 */
async function refreshSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  // Only refresh if there's an existing auth cookie — no point calling getUser()
  // for unauthenticated requests (wastes Supabase rate limit)
  const hasAuthCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        // Re-create the response so updated request cookies are forwarded
        const newResponse = NextResponse.next({
          request: { headers: request.headers },
        });
        // Copy over any headers we already set
        response.headers.forEach((v, k) => newResponse.headers.set(k, v));
        cookiesToSet.forEach(({ name, value, options }) => {
          newResponse.cookies.set(name, value, options);
        });
        response = newResponse;
      },
    },
  });

  // getUser() triggers token refresh if the access token is near expiry
  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();

  // Check if we're in local development
  const isDevelopment =
    hostname.includes("localhost") ||
    hostname.includes("127.0.0.1") ||
    process.env.NODE_ENV !== "production";

  // Protect /api/ops/* routes — same domain restriction as /api/internal/*
  // Auth is handled in each route handler; middleware only enforces domain
  if (url.pathname.startsWith("/api/ops")) {
    if (!isDevelopment && !hostname.startsWith("internal.") && hostname !== "internal.nuvvy.in") {
      return new NextResponse(null, { status: 404 });
    }
    let response = NextResponse.next();
    response.headers.set("x-pathname", url.pathname);
    // Skip session refresh on auth endpoints to avoid interfering with OTP/login
    const isAuthApi = url.pathname.startsWith("/api/ops/auth");
    if (!isAuthApi) {
      const mwAuthStart = Date.now();
      response = await refreshSession(request, response);
      response.headers.set("x-mw-auth-ms", String(Date.now() - mwAuthStart));
    }
    return response;
  }

  // Protect /api/internal/* routes — domain gating only, auth handled in route handlers
  if (url.pathname.startsWith("/api/internal")) {
    if (!isDevelopment && !hostname.startsWith("internal.") && hostname !== "internal.nuvvy.in") {
      return new NextResponse(null, { status: 404 });
    }
    let response = NextResponse.next();
    response.headers.set("x-pathname", url.pathname);
    const mwAuthStart = Date.now();
    response = await refreshSession(request, response);
    response.headers.set("x-mw-auth-ms", String(Date.now() - mwAuthStart));
    return response;
  }

  // Add pathname to headers for layout to check
  let response = NextResponse.next();
  response.headers.set("x-pathname", url.pathname);

  // Refresh session for all ops/internal pages — but skip login/public pages
  // where there's no session to refresh (avoids interfering with OTP flow)
  const isAuthPage = url.pathname.startsWith("/ops/login") || url.pathname.startsWith("/ops/g/");
  if (!isAuthPage && (url.pathname.startsWith("/ops") || url.pathname.startsWith("/internal"))) {
    const mwAuthStart = Date.now();
    response = await refreshSession(request, response);
    response.headers.set("x-mw-auth-ms", String(Date.now() - mwAuthStart));
  }

  // In development: allow direct access to /internal routes
  if (isDevelopment) {
    return response;
  }
  
  // Production: subdomain-based routing
  // Check if request is for internal subdomain
  if (hostname.startsWith("internal.") || hostname === "internal.nuvvy.in") {
    // /ops/* and /api/ops/* routes pass through directly (no rewrite needed)
    if (url.pathname.startsWith("/ops") || url.pathname.startsWith("/api/ops")) {
      response.headers.set("x-pathname", url.pathname);
      return response;
    }

    // Rewrite all other paths to /internal/* routes
    if (url.pathname === "/") {
      url.pathname = "/internal";
    } else if (!url.pathname.startsWith("/internal")) {
      url.pathname = `/internal${url.pathname}`;
    }
    const rewriteResponse = NextResponse.rewrite(url);
    rewriteResponse.headers.set("x-pathname", url.pathname);
    return rewriteResponse;
  }
  
  // Production: block access to /internal and /ops routes from public domain
  if (url.pathname.startsWith("/internal") || url.pathname.startsWith("/ops")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  
  // Public app - no rewrite needed
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Note: We need to match /api/internal/* to protect it
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
