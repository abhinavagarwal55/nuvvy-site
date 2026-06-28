import type { Metadata } from "next";
import { OG_DEFAULT_IMAGE } from "@/lib/constants";
import { getSiteUrl } from "@/lib/utils/metadata";

// Public catalog reads `?type=` via useSearchParams — keep route dynamic.
export const dynamic = "force-dynamic";

const baseUrl = getSiteUrl().replace(/\/$/, "");

const ogImageUrl = OG_DEFAULT_IMAGE.startsWith("http")
  ? OG_DEFAULT_IMAGE
  : `${baseUrl}${OG_DEFAULT_IMAGE}`;

const title = "Plant Catalog for Bangalore Balconies | Nuvvy";
const description =
  "Browse a curated catalog of indoor and balcony plants for Bangalore homes, with light, watering, and care guidance from Nuvvy's horticulturists.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: `${baseUrl}/plantcatalog`,
  },
  openGraph: {
    title,
    description,
    url: `${baseUrl}/plantcatalog`,
    siteName: "Nuvvy",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "Nuvvy Plant Catalog",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImageUrl],
  },
};

export default function PlantCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
