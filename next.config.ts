import type { NextConfig } from "next"

const nextConfig: NextConfig = {
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
  async redirects() {
    return [
      {
        source: "/",
        destination: "/challenges",
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/:path*"
            : "/api/:path*",
      },
    ]
  },
}

export default nextConfig
