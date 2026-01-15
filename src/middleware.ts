import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();
  
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
  
  // Block access to /internal routes from public domain
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
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
