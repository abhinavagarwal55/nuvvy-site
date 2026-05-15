export const AMAZON_AFFILIATE_TAG = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG;

type AffiliateInput = {
  amazon_asin: string | null;
  amazon_url: string | null;
};

/**
 * Build the customer-facing affiliate URL.
 * Prefers ASIN + env tag (canonical) over a stored URL (fallback).
 * Returns empty string only if both are missing — caller should guard.
 */
export function buildAffiliateUrl(p: AffiliateInput): string {
  if (p.amazon_asin && AMAZON_AFFILIATE_TAG) {
    return `https://www.amazon.in/dp/${p.amazon_asin}/?tag=${AMAZON_AFFILIATE_TAG}`;
  }
  if (p.amazon_asin) {
    // Tag missing — link still works, no commission.
    return `https://www.amazon.in/dp/${p.amazon_asin}`;
  }
  return p.amazon_url ?? "";
}

/**
 * Extract a 10-char ASIN from a typical Amazon URL.
 * Returns null if no ASIN match.
 */
export function extractAsinFromUrl(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1].toUpperCase() : null;
}
