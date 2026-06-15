import type { NextConfig } from "next";

// Read basePath from environment variable, default to empty string
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: basePath,
  assetPrefix: basePath,
  eslint: { ignoreDuringBuilds: true },
  // Keep pdfkit unbundled so its runtime font-metric files (e.g. Helvetica.afm)
  // resolve via the real node_modules path instead of a rewritten __dirname.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    staleTimes: {
      dynamic: 0, // Don't cache dynamic layouts/pages in router cache
    },
  },
  // Allow remote images used in the Inspiration Gallery and Airtable attachments
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "dl.airtable.com",
      },
      {
        protocol: "https",
        hostname: "v5.airtableusercontent.com",
      },
      {
        protocol: "https",
        hostname: "v4.airtableusercontent.com",
      },
      {
        protocol: "https",
        hostname: "airtableusercontent.com",
      },
      {
        protocol: "https",
        hostname: "xkotfqrvkjxmwydroacw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
