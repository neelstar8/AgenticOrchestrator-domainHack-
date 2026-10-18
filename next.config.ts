import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next.js 16 PPR). Every Sentinel page is authenticated and
  // request-time, so request reads live behind <Suspense> boundaries and the
  // surrounding chrome prerenders into the static shell.
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Sentinel never renders remote images; the logo is inline SVG.
  images: {
    remotePatterns: [],
  },
  typedRoutes: true,
};

export default nextConfig;
