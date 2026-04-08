import { headers } from "next/headers";

/**
 * Check if auth should be bypassed in development.
 * Bypass is EXPLICIT OPT-IN only — set NUVVY_DEV_BYPASS_AUTH=true in .env.local.
 * Off by default so you can test the real auth flow locally.
 */
export async function isDevBypassAuth(): Promise<boolean> {
  if (process.env.NUVVY_DEV_BYPASS_AUTH !== "true") return false;

  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    return host.includes("localhost") || host.includes("127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * Check if auth should be bypassed in middleware (edge runtime).
 * Bypass is EXPLICIT OPT-IN only — set NUVVY_DEV_BYPASS_AUTH=true in .env.local.
 */
export function isDevBypassAuthMiddleware(hostname: string): boolean {
  if (process.env.NUVVY_DEV_BYPASS_AUTH !== "true") return false;
  return hostname.includes("localhost") || hostname.includes("127.0.0.1");
}
