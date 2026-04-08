import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Analytics from "@/lib/analytics";
import { getSiteUrl } from "@/lib/utils/metadata";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Set metadataBase for proper Open Graph image URL resolution
const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
};

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
const telephone = whatsappNumber ? `+${whatsappNumber}` : "+91XXXXXXXXXX";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "name": "Nuvvy",
      "description": "Horticulturist-led balcony and indoor garden care subscription service in Bangalore",
      "url": "https://nuvvy.in",
      "telephone": telephone,
      "areaServed": ["Whitefield", "Bangalore"],
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Whitefield",
        "addressRegion": "Bangalore",
        "addressCountry": "IN",
      },
      "priceRange": "₹999 - ₹1099/month",
    },
    {
      "@type": "Service",
      "name": "Balcony Garden Care Subscription",
      "provider": { "@type": "LocalBusiness", "name": "Nuvvy" },
      "areaServed": "Bangalore",
      "description": "Monthly subscription for expert horticulturist-led garden care including fertilizer and pest control",
      "offers": {
        "@type": "Offer",
        "price": "999",
        "priceCurrency": "INR",
        "priceSpecification": { "@type": "UnitPriceSpecification", "billingDuration": "P1M" },
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
