/**
 * Helper to generate absolute API URLs for internal routes.
 * This bypasses any basePath configuration that might prefix routes.
 * 
 * @param path - API path starting with "/api/" (e.g., "/api/internal/customers")
 * @returns Absolute URL for the API endpoint
 */
export function getInternalApiUrl(path: string): string {
  if (!path.startsWith("/api/")) {
    throw new Error(`getInternalApiUrl: path must start with "/api/", got: ${path}`);
  }

  // Use absolute URL to bypass basePath prefix
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }

  // Server-side fallback (shouldn't be needed for client components)
  return path;
}
