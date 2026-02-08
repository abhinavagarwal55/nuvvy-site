import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";
import { isDevBypassAuthMiddleware } from "@/lib/internal/dev-bypass";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();
  
  // Check if we're in local development
  const isDevelopment = 
    hostname.includes("localhost") || 
    hostname.includes("127.0.0.1") ||
    process.env.NODE_ENV !== "production";
  
  // Check if dev bypass is enabled
  const bypassAuth = isDevBypassAuthMiddleware(hostname);
  
  // Protect /api/internal/* routes
  if (url.pathname.startsWith("/api/internal")) {
    // Block from public domain - return 404
    if (!isDevelopment && !hostname.startsWith("internal.") && hostname !== "internal.nuvvy.in") {
      return new NextResponse(null, { status: 404 });
    }

    // Skip auth check if dev bypass is enabled
    if (bypassAuth) {
      return NextResponse.next();
    }

    // Check authentication for internal API routes
    try {
      const { supabase, response } = createMiddlewareSupabaseClient(request);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      return response;
    } catch (error) {
      // If auth check fails, return 401
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }
  
  // Add pathname to headers for layout to check
  const response = NextResponse.next();
  response.headers.set("x-pathname", url.pathname);

  // In development: allow direct access to /internal routes
  if (isDevelopment) {
    return response;
  }
  
  // Production: subdomain-based routing
  // Check if request is for internal subdomain
  if (hostname.startsWith("internal.") || hostname === "internal.nuvvy.in") {
    // Rewrite to internal app routes
    // Rewrite root and all paths to /internal/* routes
    if (url.pathname === "/") {
      url.pathname = "/internal";
    } else if (!url.pathname.startsWith("/internal")) {
      url.pathname = `/internal${url.pathname}`;
    }
    const rewriteResponse = NextResponse.rewrite(url);
    rewriteResponse.headers.set("x-pathname", url.pathname);
    return rewriteResponse;
  }
  
  // Production: block access to /internal routes from public domain
  if (url.pathname.startsWith("/internal")) {
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
