import { describe, expect, it } from "vitest"

import { buildApiRewrites, resolveBackendUrl } from "@/lib/config/api-rewrites"

describe("api-rewrites configuration", () => {
  it("resolves explicitly configured BACKEND_URL and strips trailing slashes", () => {
    expect(
      resolveBackendUrl({ BACKEND_URL: "https://backend.diffly.dev/" })
    ).toBe("https://backend.diffly.dev")

    expect(
      buildApiRewrites({ BACKEND_URL: "https://backend.diffly.dev/" })
    ).toEqual([
      {
        source: "/api/:path*",
        destination: "https://backend.diffly.dev/api/:path*",
      },
    ])
  })

  it("returns null on Vercel when BACKEND_URL is not provided (serverless Python route)", () => {
    expect(
      resolveBackendUrl({ VERCEL: "1", NODE_ENV: "production" })
    ).toBeNull()
    expect(buildApiRewrites({ VERCEL: "1", NODE_ENV: "production" })).toEqual(
      []
    )

    expect(
      resolveBackendUrl({ VERCEL: "true", NODE_ENV: "production" })
    ).toBeNull()
  })

  it("prefers explicit BACKEND_URL even when on Vercel", () => {
    expect(
      resolveBackendUrl({
        VERCEL: "1",
        BACKEND_URL: "https://diffly-api.railway.app",
      })
    ).toBe("https://diffly-api.railway.app")
  })

  it("resolves local development fallback when NODE_ENV is development", () => {
    expect(resolveBackendUrl({ NODE_ENV: "development" })).toBe(
      "http://127.0.0.1:8000"
    )
    expect(buildApiRewrites({ NODE_ENV: "development" })).toEqual([
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ])
  })

  it("resolves standalone Docker container fallback in production when outside Vercel", () => {
    expect(resolveBackendUrl({ NODE_ENV: "production" })).toBe(
      "http://backend:8000"
    )
    expect(buildApiRewrites({ NODE_ENV: "production" })).toEqual([
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
    ])
  })
})
