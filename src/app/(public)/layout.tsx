import type { Metadata } from "next";
import LandingHeader from "@/components/LandingHeader";
import { getSiteUrl, getAbsoluteImageUrl } from "@/lib/utils/metadata";

// Get site URL for metadata
const siteUrl = getSiteUrl();
const whatsappImageUrl = getAbsoluteImageUrl("/images/whatsapp_main_image.png");

export const metadata: Metadata = {
  title: "Nuvvy | Horticulturist-led garden care for your balcony",
  description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
  openGraph: {
    title: "Horticulturist-led garden care for your balcony",
    description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
    url: siteUrl,
    siteName: "Nuvvy",
    images: [
      {
        url: whatsappImageUrl,
        width: 1200,
        height: 630,
        alt: "Nuvvy - Horticulturist-led garden care",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Horticulturist-led garden care for your balcony",
    description: "Professional plant care, expert selection, and ongoing maintenance — without the effort.",
    images: [whatsappImageUrl],
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingHeader />
      <main className="pt-6 md:pt-10">
        {children}
      </main>
    </>
  );
}
