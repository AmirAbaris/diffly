import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mockGenerateText = vi.hoisted(() => vi.fn())

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return {
    ...actual,
    generateText: mockGenerateText,
  }
})

import { DELETE, GET, POST } from "@/app/api/ai/connection/route"
import { BYOK_COOKIE_NAME, sealAICredential } from "@/lib/ai/cookie"

describe("app/api/ai/connection/route", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    mockGenerateText.mockReset()
  })

  it("GET returns connected: false when cookie is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/ai/connection")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("vary")).toBe("Cookie")
    expect(await response.json()).toEqual({ connected: false })
  })

  it("GET returns masked metadata for a valid sealed cookie", async () => {
    const rawKey = "sk-ant-api03-secret-9876"
    const sealed = sealAICredential({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: rawKey,
    })

    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      headers: { cookie: `${BYOK_COOKIE_NAME}=${sealed}` },
    })
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toEqual({
      connected: true,
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      maskedKey: "sk-a••••9876",
    })
    expect(JSON.stringify(body)).not.toContain(rawKey)
  })

  it("GET returns connected: false when cookie is tampered", async () => {
    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      headers: { cookie: `${BYOK_COOKIE_NAME}=v1.tampered.cookie.value` },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("vary")).toBe("Cookie")
    expect(await response.json()).toEqual({ connected: false })
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("POST returns 400 on invalid payload", async () => {
    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", model: "", apiKey: "" }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("POST returns mapped error status without setting cookie when generateText fails", async () => {
    mockGenerateText.mockRejectedValueOnce({ statusCode: 401 })

    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-invalid-1234567890",
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("POST verifies, sets HttpOnly cookie, and returns masked metadata on success", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "ok" })
    const rawKey = "sk-openai-live-secret-4321"

    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: rawKey,
      }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toEqual({
      connected: true,
      provider: "openai",
      model: "gpt-4o-mini",
      maskedKey: "sk-o••••4321",
    })
    expect(JSON.stringify(body)).not.toContain(rawKey)

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${BYOK_COOKIE_NAME}=v1.`)
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie.toLowerCase()).toContain("samesite=lax")
    expect(setCookie).toContain("Path=/api")
    expect(setCookie).toContain("Max-Age=2592000")
    expect(setCookie).not.toContain(rawKey)
  })

  it("POST returns 415 on non-JSON Content-Type", async () => {
    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    })
    const response = await POST(request)

    expect(response.status).toBe(415)
    expect(response.headers.get("vary")).toBe("Cookie")
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it("POST and DELETE return 403 on cross-site Origin or Sec-Fetch-Site", async () => {
    const crossOriginPost = new NextRequest(
      "http://localhost:3000/api/ai/connection",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.com",
        },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "sk-1234567890",
        }),
      }
    )
    expect((await POST(crossOriginPost)).status).toBe(403)

    const crossSiteFetchPost = new NextRequest(
      "http://localhost:3000/api/ai/connection",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "sk-1234567890",
        }),
      }
    )
    expect((await POST(crossSiteFetchPost)).status).toBe(403)

    const crossOriginDelete = new NextRequest(
      "http://localhost:3000/api/ai/connection",
      {
        method: "DELETE",
        headers: { origin: "https://evil.example.com" },
      }
    )
    expect((await DELETE(crossOriginDelete)).status).toBe(403)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it("POST returns generic 500 without calling generateText when prod secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})

    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-1234567890",
      }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: "AI connection service is not configured.",
    })
    expect(mockGenerateText).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it("DELETE clears cookie and returns connected: false", async () => {
    const request = new NextRequest("http://localhost:3000/api/ai/connection", {
      method: "DELETE",
    })
    const response = await DELETE(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("vary")).toBe("Cookie")
    expect(await response.json()).toEqual({ connected: false })

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${BYOK_COOKIE_NAME}=`)
    expect(setCookie).toContain("Max-Age=0")
    expect(setCookie).toContain("Path=/api")
  })
})
