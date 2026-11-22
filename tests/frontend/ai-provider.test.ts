import { afterEach, describe, expect, it, vi } from "vitest"

const mockGenerateText = vi.hoisted(() => vi.fn())
const mockDnsLookup = vi.hoisted(() => vi.fn())

vi.mock("node:dns/promises", () => ({
  lookup: mockDnsLookup,
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return {
    ...actual,
    generateText: mockGenerateText,
  }
})

import {
  AI_PROVIDERS,
  createBYOKModel,
  createSafeFetch,
  parseCredentialInput,
  verifyBYOKConnection,
  type SealedAICredential,
} from "@/lib/ai/provider"

describe("lib/ai/provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    mockGenerateText.mockReset()
    mockDnsLookup.mockReset()
  })

  it("validates credential inputs for all four providers", () => {
    for (const provider of AI_PROVIDERS) {
      const result = parseCredentialInput({
        provider,
        model: "  test-model  ",
        apiKey: "  sk-test-1234567890  ",
        ...(provider === "openai-compatible"
          ? { baseUrl: "https://api.together.xyz/v1/" }
          : {}),
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.provider).toBe(provider)
        expect(result.value.model).toBe("test-model")
        expect(result.value.apiKey).toBe("sk-test-1234567890")
      }
    }
  })

  it("requires baseUrl for openai-compatible and rejects invalid inputs", () => {
    expect(
      parseCredentialInput({
        provider: "openai-compatible",
        model: "llama-3",
        apiKey: "sk-1234567890",
      })
    ).toEqual({
      ok: false,
      message: "Base URL is required for this provider.",
    })

    expect(
      parseCredentialInput({
        provider: "unknown",
        model: "gpt-4o",
        apiKey: "sk-1234567890",
      })
    ).toEqual({
      ok: false,
      message: "Unsupported AI provider.",
    })

    expect(
      parseCredentialInput({
        provider: "openai",
        model: "   ",
        apiKey: "sk-1234567890",
      })
    ).toEqual({
      ok: false,
      message: "Model name is required.",
    })
  })

  it("enforces https and blocks SSRF targets in production unless overridden", () => {
    vi.stubEnv("NODE_ENV", "production")

    expect(
      parseCredentialInput({
        provider: "openai-compatible",
        model: "llama3",
        apiKey: "sk-1234567890",
        baseUrl: "http://api.example.com/v1",
      })
    ).toEqual({
      ok: false,
      message: "Base URL must use https in production.",
    })

    const blockedUrls = [
      "https://localhost:11434/v1",
      "https://localhost.:11434/v1",
      "https://backend/v1",
      "https://service.local/v1",
      "https://metadata.internal/v1",
      "https://127.0.0.1:8080/v1",
      "https://10.0.0.5/v1",
      "https://100.64.0.1/v1",
      "https://169.254.169.254/latest/meta-data",
      "https://172.16.0.1/v1",
      "https://192.168.1.10/v1",
      "https://224.0.0.1/v1",
      "https://[::1]:8000/v1",
      "https://0.0.0.0/v1",
      "https://[fc00::1]/v1",
      "https://[fe80::1]/v1",
      "https://[::ffff:172.16.0.1]/v1",
      "https://[::ffff:ac10:1]/v1",
      "https://[::ffff:0.0.0.1]/v1",
      "https://[64:ff9b::a9fe:a9fe]/v1",
      "https://api.example.com/v1?query=1",
      "https://api.example.com/v1#fragment",
    ]

    for (const baseUrl of blockedUrls) {
      const result = parseCredentialInput({
        provider: "openai-compatible",
        model: "llama3",
        apiKey: "sk-1234567890",
        baseUrl,
      })
      expect(result.ok, `expected ${baseUrl} to be blocked`).toBe(false)
    }

    vi.stubEnv("BYOK_ALLOW_PRIVATE_BASE_URLS", "true")
    expect(
      parseCredentialInput({
        provider: "openai-compatible",
        model: "llama3",
        apiKey: "sk-1234567890",
        baseUrl: "https://192.168.1.10/v1",
      }).ok
    ).toBe(true)
  })

  it("allows http localhost in non-production for local inference servers", () => {
    vi.stubEnv("NODE_ENV", "development")

    const result = parseCredentialInput({
      provider: "openai-compatible",
      model: "qwen2.5-coder",
      apiKey: "ollama",
      baseUrl: "http://localhost:11434/v1",
    })

    expect(result).toEqual({
      ok: true,
      value: {
        provider: "openai-compatible",
        model: "qwen2.5-coder",
        apiKey: "ollama",
        baseUrl: "http://localhost:11434/v1",
      },
    })
  })

  it("creates a LanguageModel instance for every supported provider", () => {
    const credentials: SealedAICredential[] = [
      {
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: "gk-1234567890",
      },
      { provider: "openai", model: "gpt-4o-mini", apiKey: "sk-1234567890" },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: "ak-1234567890",
      },
      {
        provider: "openai-compatible",
        model: "llama-3.3-70b",
        apiKey: "ok-1234567890",
        baseUrl: "https://api.example.com/v1",
      },
    ]

    for (const credential of credentials) {
      const model = createBYOKModel(credential)
      expect(model).toBeDefined()
    }
  })

  it("maps provider verification errors without exposing apiKey", async () => {
    const secretKey = "sk-super-secret-do-not-leak"
    const credential: SealedAICredential = {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: secretKey,
    }

    mockGenerateText.mockRejectedValueOnce({ statusCode: 401 })
    const authFail = await verifyBYOKConnection(credential)
    expect(authFail).toMatchObject({ ok: false, status: 401 })
    expect(JSON.stringify(authFail)).not.toContain(secretKey)

    mockGenerateText.mockRejectedValueOnce({ statusCode: 400 })
    expect(await verifyBYOKConnection(credential)).toMatchObject({
      ok: false,
      status: 400,
    })

    mockGenerateText.mockRejectedValueOnce({ statusCode: 404 })
    expect(await verifyBYOKConnection(credential)).toMatchObject({
      ok: false,
      status: 400,
    })

    mockGenerateText.mockRejectedValueOnce({ statusCode: 429 })
    expect(await verifyBYOKConnection(credential)).toMatchObject({
      ok: false,
      status: 429,
    })

    const circularError: { cause?: unknown } = {}
    circularError.cause = circularError
    mockGenerateText.mockRejectedValueOnce(circularError)
    expect(await verifyBYOKConnection(credential)).toMatchObject({
      ok: false,
      status: 502,
    })

    const callerController = new AbortController()
    callerController.abort()
    mockGenerateText.mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError")
    )
    expect(
      await verifyBYOKConnection(credential, {
        signal: callerController.signal,
      })
    ).toMatchObject({
      ok: false,
      status: 499,
    })

    const timeoutErr = new Error(`Timeout with ${secretKey}`)
    timeoutErr.name = "TimeoutError"
    mockGenerateText.mockRejectedValueOnce(timeoutErr)
    const timeoutResult = await verifyBYOKConnection(credential)
    expect(timeoutResult).toMatchObject({ ok: false, status: 504 })
    expect(JSON.stringify(timeoutResult)).not.toContain(secretKey)

    mockGenerateText.mockRejectedValueOnce(new Error(`Boom ${secretKey}`))
    const unknownResult = await verifyBYOKConnection(credential)
    expect(unknownResult).toMatchObject({ ok: false, status: 502 })
    expect(JSON.stringify(unknownResult)).not.toContain(secretKey)

    mockGenerateText.mockResolvedValueOnce({ text: "ok" })
    expect(await verifyBYOKConnection(credential)).toEqual({ ok: true })
  })

  it("rejects control characters and over-length credential fields", () => {
    expect(
      parseCredentialInput({
        provider: "openai",
        model: "gpt-4o\n",
        apiKey: "sk-1234567890",
      }).ok
    ).toBe(false)

    expect(
      parseCredentialInput({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-1234\r567890",
      }).ok
    ).toBe(false)

    expect(
      parseCredentialInput({
        provider: "openai-compatible",
        model: "llama3",
        apiKey: "sk-1234567890",
        baseUrl: "https://api.example.com/v1\0",
      }).ok
    ).toBe(false)

    expect(
      parseCredentialInput({
        provider: "openai",
        model: "m".repeat(201),
        apiKey: "sk-1234567890",
      }).ok
    ).toBe(false)

    expect(
      parseCredentialInput({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "k".repeat(513),
      }).ok
    ).toBe(false)

    expect(
      parseCredentialInput({
        provider: "openai-compatible",
        model: "llama3",
        apiKey: "sk-1234567890",
        baseUrl: `https://api.example.com/${"a".repeat(500)}`,
      }).ok
    ).toBe(false)
  })

  it("blocks DNS-resolved private IPs and disables redirects in createSafeFetch", async () => {
    vi.stubEnv("VERCEL", "true")
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", mockFetch)

    const safeFetch = createSafeFetch()

    mockDnsLookup.mockResolvedValueOnce([
      { address: "169.254.169.254", family: 4 },
    ])
    await expect(safeFetch("https://rebind.example.com/v1")).rejects.toThrow(
      "blocked IP"
    )
    expect(mockFetch).not.toHaveBeenCalled()

    mockDnsLookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ])
    await safeFetch("https://api.example.com/v1")
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1",
      expect.objectContaining({ redirect: "error" })
    )
  })
})
