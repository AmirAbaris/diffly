import type { NextConfig } from "next"

import { buildApiRewrites } from "./lib/config/api-rewrites"
import { buildSecurityHeaders } from "./lib/config/security-headers"

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: true,
  cacheComponents: true,
  partialPrefetching: true,
  logging: {
    browserToTerminal: true,
  },
  experimental: {
    agentUpgrade: "security",
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  async headers() {
    return buildSecurityHeaders(process.env)
  },
  async rewrites() {
    return buildApiRewrites(process.env)
  },
}

export default nextConfig
