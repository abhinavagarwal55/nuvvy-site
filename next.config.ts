import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
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
    ],
  },
};

export default nextConfig;
