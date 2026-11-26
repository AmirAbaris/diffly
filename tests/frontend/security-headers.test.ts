import { describe, expect, it } from "vitest"

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "@/lib/config/security-headers"

describe("security-headers configuration", () => {
  it("builds development CSP with dev-only eval, HMR websockets, and no HTTPS upgrade", () => {
    const csp = buildContentSecurityPolicy({ NODE_ENV: "development" })
    const directives = csp.split("; ")

    expect(directives).toContain("default-src 'self'")
    expect(directives).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    )
    expect(directives).toContain("style-src 'self' 'unsafe-inline'")
    expect(directives).toContain(
      "img-src 'self' data: blob: https://avatars.githubusercontent.com"
    )
    expect(directives).toContain("font-src 'self' data:")
    expect(directives).toContain(
      "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"
    )
    expect(directives).toContain("worker-src 'self'")
    expect(directives).toContain("object-src 'none'")
    expect(directives).toContain("base-uri 'self'")
    expect(directives).toContain("form-action 'self'")
    expect(directives).toContain("frame-ancestors 'none'")
    expect(directives).not.toContain("upgrade-insecure-requests")
  })

  it("builds production local HTTP CSP without unsafe-eval, dev WS, or upgrade-insecure-requests", () => {
    const csp = buildContentSecurityPolicy({ NODE_ENV: "production" })
    const directives = csp.split("; ")

    expect(directives).toContain("default-src 'self'")
    expect(directives).toContain("script-src 'self' 'unsafe-inline'")
    expect(directives).toContain("connect-src 'self'")
    expect(directives).toContain("object-src 'none'")
    expect(directives).toContain("frame-ancestors 'none'")
    expect(directives).not.toContain("upgrade-insecure-requests")
  })

  it("enables upgrade-insecure-requests on Vercel and when COOKIE_SECURE is true", () => {
    for (const env of [
      { NODE_ENV: "production", VERCEL: "1" },
      { NODE_ENV: "production", VERCEL: "true" },
      { NODE_ENV: "production", COOKIE_SECURE: "true" },
    ]) {
      const directives = buildContentSecurityPolicy(env).split("; ")

      expect(directives).toContain("upgrade-insecure-requests")
      expect(directives).toContain("script-src 'self' 'unsafe-inline'")
      expect(directives).toContain("connect-src 'self'")
    }
  })

  it("returns Next.js header rule for all routes with Content-Security-Policy and baseline security headers", () => {
    const env = { NODE_ENV: "production", VERCEL: "1" }
    const rules = buildSecurityHeaders(env)

    expect(rules).toEqual([
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(env),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ])
  })
})
