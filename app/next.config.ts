import type { NextConfig } from "next";

// Defaults to 8001 (normal local dev backend) unless overridden — e.g. to
// point a second frontend instance at a specific tenant's backend port.
const backendPort = process.env.DEV_BACKEND_PORT || "8001";

const nextConfig: NextConfig = {
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
