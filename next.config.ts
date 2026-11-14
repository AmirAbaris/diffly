import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: true,
  cacheComponents: true,
  partialPrefetching: true,
  logging: {
    browserToTerminal: true,
  },
  experimental: {
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_URL ||
      (process.env.NODE_ENV === "development"
        ? "http://127.0.0.1:8000"
        : "http://backend:8000")

    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl.replace(/\/$/, "")}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
