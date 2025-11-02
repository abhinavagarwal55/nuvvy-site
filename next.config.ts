import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow remote images used in the Inspiration Gallery
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;
