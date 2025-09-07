import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // …your existing config
  images: {
    // either add domains:
    domains: ["image.tmdb.org"],
    // or use remotePatterns:
    // remotePatterns: [
    //   { protocol: "https", hostname: "image.tmdb.org" }
    // ],
  },
};

export default nextConfig;