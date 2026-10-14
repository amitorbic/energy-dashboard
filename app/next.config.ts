import type { NextConfig } from "next";

// Defaults to 8001 (normal local dev backend) unless overridden — e.g. to
// point a second frontend instance at a specific tenant's backend port.
const backendPort = process.env.DEV_BACKEND_PORT || "8001";

const nextConfig: NextConfig = {
  // Dev-only rewrite proxy limits. Next's own default is 30 s, which cuts a large Portfolio
  // upload off while the backend keeps working (10,727 rows ~ 20 s, 60,000 rows ~ 2 min).
  // 10 min covers several times that; the upload page waits 10 min as well. Body limit default is 10 MB.
  experimental: {
    proxyTimeout: 600_000,
    proxyClientMaxBodySize: 50 * 1024 * 1024,
  },
  // Unset by default (Next uses ".next"). Set to run a second, isolated dev
  // instance from this same directory — each distDir gets its own
  // .next/dev/lock, so concurrent `next dev` processes stop colliding.
  ...(process.env.DEV_DIST_DIR && { distDir: process.env.DEV_DIST_DIR }),
  ...(process.env.NODE_ENV !== "production" && {
    async rewrites() {
      return [
        { source: "/api/:path*", destination: `http://127.0.0.1:${backendPort}/api/:path*` },
      ];
    },
  }),
};
export default nextConfig;
