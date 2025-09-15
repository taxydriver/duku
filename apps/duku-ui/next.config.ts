// apps/duku-ui/next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Fallback to localhost in dev, require explicit value in prod
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || (isProd ? undefined : "http://localhost:8000");

if (isProd && !API_BASE) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE is required in production. Set it in your Render env vars."
  );
}

const nextConfig: NextConfig = {
  images: {
    domains: ["image.tmdb.org", "m.media-amazon.com"], // add any poster/CDN hosts
  },
 
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },  

};


export default nextConfig;