import type { NextConfig } from "next"

import { buildApiRewrites } from "./lib/config/api-rewrites"

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
    return buildApiRewrites(process.env)
  },
}

export default nextConfig
