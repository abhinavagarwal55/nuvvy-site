import { headers } from "next/headers";

/**
 * Check if auth should be bypassed in development
 * Returns true only when:
 * - NODE_ENV === "development" OR NUVVY_DEV_BYPASS_AUTH === "true"
 * - AND hostname is localhost/127.0.0.1
 */
export async function isDevBypassAuth(): Promise<boolean> {
  // Check environment variables
  const isDevEnv = process.env.NODE_ENV === "development";
  const bypassEnv = process.env.NUVVY_DEV_BYPASS_AUTH === "true";
  
  if (!isDevEnv && !bypassEnv) {
    return false;
  }

  // Check hostname from headers (if available)
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    
    return isLocalhost;
  } catch {
    // If headers() fails (e.g., in middleware), return false for safety
    return false;
  }
}

/**
 * Check if auth should be bypassed in middleware (edge runtime)
 * Uses request hostname instead of headers() API
 */
export function isDevBypassAuthMiddleware(hostname: string): boolean {
  // Check environment variables
  const isDevEnv = process.env.NODE_ENV === "development";
  const bypassEnv = process.env.NUVVY_DEV_BYPASS_AUTH === "true";
  
  if (!isDevEnv && !bypassEnv) {
    return false;
  }

  // Check hostname
  const isLocalhost = hostname.includes("localhost") || hostname.includes("127.0.0.1");
  
  return isLocalhost;
}
