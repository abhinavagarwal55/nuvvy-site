import type { Metadata } from "next";
import { OG_DEFAULT_IMAGE } from "@/lib/constants";

// Get site URL for metadata (works at build time)
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production" ? "https://www.nuvvy.in" : "http://localhost:3000");

const ogImageUrl = OG_DEFAULT_IMAGE.startsWith("http")
  ? OG_DEFAULT_IMAGE
  : `${siteUrl}${OG_DEFAULT_IMAGE}`;

export const metadata: Metadata = {
  title: "Nuvvy Plant Catalog",
  description: "Curated plants for Bangalore balconies.",
  openGraph: {
    title: "Nuvvy Plant Catalog",
    description: "Curated plants for Bangalore balconies.",
    url: `${siteUrl}/plantcatalog`,
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
    title: "Nuvvy Plant Catalog",
    description: "Curated plants for Bangalore balconies.",
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
