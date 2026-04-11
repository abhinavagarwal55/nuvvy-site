import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
    // No auth check in middleware for ops routes — route handlers use requireOpsAuth()
    const response = NextResponse.next();
    response.headers.set("x-pathname", url.pathname);
    return response;
  }

  // Protect /api/internal/* routes — domain gating only, auth handled in route handlers
  if (url.pathname.startsWith("/api/internal")) {
    if (!isDevelopment && !hostname.startsWith("internal.") && hostname !== "internal.nuvvy.in") {
      return new NextResponse(null, { status: 404 });
    }
    const response = NextResponse.next();
    response.headers.set("x-pathname", url.pathname);
    return response;
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
