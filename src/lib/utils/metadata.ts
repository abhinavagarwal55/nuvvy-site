import { OG_DEFAULT_IMAGE } from "@/lib/constants";

/**
 * Get the site base URL from environment variable or fallback
 * Works in both server-side and client-side contexts
 */
export function getSiteUrl(): string {
  // Server-side or build-time: use env var or default
  if (typeof process !== "undefined") {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL;
    }
    // During build or SSR, default to production URL
    if (process.env.NODE_ENV === "production") {
      return "https://www.nuvvy.in";
    }
    // Development fallback
    return "http://localhost:3000";
  }
  
  // Client-side fallback (shouldn't be needed but safe)
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  
  // Ultimate fallback
  return "http://localhost:3000";
}

/**
 * Convert a relative image URL to an absolute URL
 */
export function getAbsoluteImageUrl(imageUrl: string | undefined | null): string {
  if (!imageUrl) {
    return `${getSiteUrl()}${OG_DEFAULT_IMAGE}`;
  }

  // If already absolute (starts with http:// or https://), return as is
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // Convert relative URL to absolute
  const siteUrl = getSiteUrl().replace(/\/$/, ""); // Remove trailing slash
  const cleanUrl = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${siteUrl}${cleanUrl}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + "...";
}
