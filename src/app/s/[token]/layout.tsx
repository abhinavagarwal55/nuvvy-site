import type { Metadata } from "next";
import { getSiteUrl, getAbsoluteImageUrl } from "@/lib/utils/metadata";
import { OG_DEFAULT_IMAGE } from "@/lib/constants";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper to safely read JSON from response
async function safeReadJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        return { ok: false, body: JSON.parse(text) };
      } catch {}
    }
    return { ok: false, body: { error: text?.slice(0, 300) || `Request failed (${res.status})` } };
  }
  if (!text) return { ok: true, body: null };
  if (contentType.includes("application/json")) {
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, body: { error: "Invalid JSON returned from server" } };
    }
  }
  return { ok: false, body: { error: "Server returned non-JSON response" } };
}

interface Plant {
  price_band?: string | null;
  image_storage_url?: string | null;
  image_url?: string | null;
  thumbnail_storage_url?: string | null;
  thumbnail_url?: string | null;
}

interface VersionItem {
  quantity: number | null;
  plant: Plant | null;
}

interface ShortlistData {
  items: VersionItem[];
  customer_name?: string | null;
}

// Server-side metadata generation
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  try {
    const { token } = await params;
    const siteUrl = getSiteUrl();
    const baseUrl = siteUrl.replace(/\/$/, ""); // Remove trailing slash
    
    // Fetch shortlist data from API (server-side)
    const apiUrl = `${baseUrl}/api/shortlists/public/${token}`;
    const response = await fetch(apiUrl, {
      cache: "no-store", // Ensure fresh data
    });

    const result = await safeReadJson(response);

    // Fallback metadata if fetch fails
    if (!result.ok || result.body?.error || !result.body) {
      return {
        title: "Your Nuvvy Plant Shortlist 🌿",
        description: "Review and confirm your plant shortlist.",
        openGraph: {
          title: "Your Nuvvy Plant Shortlist 🌿",
          description: "Review and confirm your plant shortlist.",
          url: `${baseUrl}/s/${token}`,
          siteName: "Nuvvy",
          images: [
            {
              url: getAbsoluteImageUrl(OG_DEFAULT_IMAGE),
              width: 1200,
              height: 630,
              alt: "Nuvvy Plant Shortlist",
            },
          ],
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: "Your Nuvvy Plant Shortlist 🌿",
          description: "Review and confirm your plant shortlist.",
          images: [getAbsoluteImageUrl(OG_DEFAULT_IMAGE)],
        },
        alternates: {
          canonical: `${baseUrl}/s/${token}`,
        },
      };
    }

    const data: ShortlistData = result.body;
    const items = data.items || [];
    const customerName = data.customer_name;
    const plantCount = items.length;

    // Generate title
    const title = customerName
      ? `${customerName}'s Nuvvy Plant Shortlist 🌿`
      : "Your Nuvvy Plant Shortlist 🌿";

    // Calculate estimated price range
    let priceMin = 0;
    let priceMax = 0;
    let hasPrice = false;

    items.forEach((item) => {
      if (!item.plant?.price_band) return;
      const priceBand = item.plant.price_band;
      const numbers = priceBand.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        const min = parseInt(numbers[0], 10);
        const max = parseInt(numbers[1], 10);
        const qty = item.quantity || 1;
        priceMin += min * qty;
        priceMax += max * qty;
        hasPrice = true;
      }
    });

    // Generate description
    let description = `${plantCount} plant${plantCount !== 1 ? "s" : ""}`;
    if (hasPrice && priceMin > 0 && priceMax > 0) {
      const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
      description += ` • Estimated ${formatCurrency(priceMin)}–${formatCurrency(priceMax)}`;
    }
    description += ". Review and confirm your shortlist.";

    // Get first plant image for OG image
    let ogImageUrl = OG_DEFAULT_IMAGE;
    const firstItem = items.find((item) => item.plant);
    if (firstItem?.plant) {
      const plant = firstItem.plant;
      ogImageUrl =
        plant.image_storage_url ||
        plant.image_url ||
        plant.thumbnail_storage_url ||
        plant.thumbnail_url ||
        OG_DEFAULT_IMAGE;
    }

    const absoluteImageUrl = getAbsoluteImageUrl(ogImageUrl);
    const canonicalUrl = `${baseUrl}/s/${token}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        siteName: "Nuvvy",
        images: [
          {
            url: absoluteImageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [absoluteImageUrl],
      },
      alternates: {
        canonical: canonicalUrl,
      },
    };
  } catch (error) {
    console.error("Error generating metadata for shortlist:", error);
    // Fallback metadata on error
    const siteUrl = getSiteUrl();
    const baseUrl = siteUrl.replace(/\/$/, "");
    let token = "";
    try {
      const resolvedParams = await params;
      token = resolvedParams.token;
    } catch {
      // If we can't get token, use empty string (will result in invalid URL but won't crash)
    }
    
    return {
      title: "Your Nuvvy Plant Shortlist 🌿",
      description: "Review and confirm your plant shortlist.",
      openGraph: {
        title: "Your Nuvvy Plant Shortlist 🌿",
        description: "Review and confirm your plant shortlist.",
        url: token ? `${baseUrl}/s/${token}` : `${baseUrl}/s`,
        siteName: "Nuvvy",
        images: [
          {
            url: getAbsoluteImageUrl(OG_DEFAULT_IMAGE),
            width: 1200,
            height: 630,
            alt: "Nuvvy Plant Shortlist",
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Your Nuvvy Plant Shortlist 🌿",
        description: "Review and confirm your plant shortlist.",
        images: [getAbsoluteImageUrl(OG_DEFAULT_IMAGE)],
      },
      alternates: {
        canonical: token ? `${baseUrl}/s/${token}` : `${baseUrl}/s`,
      },
    };
  }
}

export default function ShortlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
