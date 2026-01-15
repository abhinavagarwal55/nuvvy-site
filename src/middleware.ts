import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();
  
  // Check if we're in local development
  const isDevelopment = 
    hostname.includes("localhost") || 
    hostname.includes("127.0.0.1") ||
    process.env.NODE_ENV !== "production";
  
  // Protect /api/internal/* routes
  if (url.pathname.startsWith("/api/internal")) {
    // Allow in development or from internal subdomain
    if (isDevelopment || hostname.startsWith("internal.") || hostname === "internal.nuvvy.in") {
      return NextResponse.next();
    }
    // Block from public domain - return 404
    return new NextResponse(null, { status: 404 });
  }
  
  // In development: allow direct access to /internal routes
  if (isDevelopment) {
    // Allow /internal routes to render normally
    return NextResponse.next();
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
    return NextResponse.rewrite(url);
  }
  
  // Production: block access to /internal routes from public domain
  if (url.pathname.startsWith("/internal")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  
  // Public app - no rewrite needed
  return NextResponse.next();
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
