import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveInternalBackendOrigin } from "@/lib/server/backend-client"

describe("resolveInternalBackendOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL and request origin in production", () => {
    vi.stubEnv("BACKEND_URL", "")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "diffly-sigma.vercel.app")
    vi.stubEnv("VERCEL_URL", "diffly-7tmv4uih7-amirabaris-projects.vercel.app")

    const request = new NextRequest("https://spoofed.example.com/api/coach")

    expect(resolveInternalBackendOrigin(request)).toBe(
      "https://diffly-sigma.vercel.app"
    )
  })

  it("normalizes VERCEL_PROJECT_PRODUCTION_URL with scheme and trailing slash", () => {
    vi.stubEnv("BACKEND_URL", "")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv(
      "VERCEL_PROJECT_PRODUCTION_URL",
      "https://diffly-sigma.vercel.app/"
    )
    vi.stubEnv("VERCEL_URL", "diffly-7tmv4uih7-amirabaris-projects.vercel.app")

    expect(resolveInternalBackendOrigin()).toBe(
      "https://diffly-sigma.vercel.app"
    )
  })

  it("uses VERCEL_URL instead of VERCEL_PROJECT_PRODUCTION_URL in preview deployments", () => {
    vi.stubEnv("BACKEND_URL", "")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "diffly-sigma.vercel.app")
    vi.stubEnv("VERCEL_URL", "diffly-7tmv4uih7-amirabaris-projects.vercel.app")

    expect(resolveInternalBackendOrigin()).toBe(
      "https://diffly-7tmv4uih7-amirabaris-projects.vercel.app"
    )
  })

  it("falls back to VERCEL_URL in production when VERCEL_PROJECT_PRODUCTION_URL is empty", () => {
    vi.stubEnv("BACKEND_URL", "")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "")
    vi.stubEnv("VERCEL_URL", "diffly-7tmv4uih7-amirabaris-projects.vercel.app")

    expect(resolveInternalBackendOrigin()).toBe(
      "https://diffly-7tmv4uih7-amirabaris-projects.vercel.app"
    )
  })

  it("prefers explicit BACKEND_URL over Vercel environment variables", () => {
    vi.stubEnv("BACKEND_URL", "https://api.example.com/")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "diffly-sigma.vercel.app")
    vi.stubEnv("VERCEL_URL", "diffly-7tmv4uih7-amirabaris-projects.vercel.app")

    expect(resolveInternalBackendOrigin()).toBe("https://api.example.com")
  })
})
