import { createCipheriv, randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BYOK_COOKIE_MAX_AGE_SECONDS,
  BYOK_COOKIE_NAME,
  BYOKConfigurationError,
  getBYOKCookieOptions,
  maskApiKey,
  resolveBYOKSecret,
  sealAICredential,
  toConnectionMetadata,
  unsealAICredential,
} from "@/lib/ai/cookie"
import type { SealedAICredential } from "@/lib/ai/provider"

describe("lib/ai/cookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("seals and unseals a credential roundtrip", () => {
    const credential: SealedAICredential = {
      provider: "openai-compatible",
      model: "llama-3.3-70b",
      apiKey: "sk-test-secret-12345678",
      baseUrl: "https://api.example.com/v1",
    }

    const sealed = sealAICredential(credential)
    expect(sealed.startsWith("v1.")).toBe(true)
    expect(sealed).not.toContain(credential.apiKey)

    const result = unsealAICredential(sealed)
    expect(result).toEqual({ status: "valid", credential })
  })

  it("returns missing for undefined or empty cookie", () => {
    expect(unsealAICredential(undefined)).toEqual({ status: "missing" })
    expect(unsealAICredential("")).toEqual({ status: "missing" })
  })

  it("returns invalid for tampered ciphertext, tag, or AAD without throwing", () => {
    const credential: SealedAICredential = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai-1234567890",
    }

    const sealed = sealAICredential(credential)
    const [version, ivB64, tagB64, cipherB64] = sealed.split(".")

    const tamperedCipher = Buffer.from(cipherB64, "base64url")
    tamperedCipher[0] ^= 0xff
    expect(
      unsealAICredential(
        [version, ivB64, tagB64, tamperedCipher.toString("base64url")].join(".")
      )
    ).toEqual({ status: "invalid" })

    const tamperedTag = Buffer.from(tagB64, "base64url")
    tamperedTag[0] ^= 0xff
    expect(
      unsealAICredential(
        [version, ivB64, tamperedTag.toString("base64url"), cipherB64].join(".")
      )
    ).toEqual({ status: "invalid" })

    const key = resolveBYOKSecret()
    const iv = randomBytes(12)
    const wrongAadCipher = createCipheriv("aes-256-gcm", key, iv)
    wrongAadCipher.setAAD(Buffer.from("wrong-aad", "utf8"))
    const encrypted = Buffer.concat([
      wrongAadCipher.update(JSON.stringify(credential), "utf8"),
      wrongAadCipher.final(),
    ])
    const wrongAadToken = [
      "v1",
      iv.toString("base64url"),
      wrongAadCipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".")
    expect(unsealAICredential(wrongAadToken)).toEqual({ status: "invalid" })

    expect(unsealAICredential("v2.abc.def.ghi")).toEqual({ status: "invalid" })
    expect(unsealAICredential("malformed")).toEqual({ status: "invalid" })
  })

  it("throws BYOKConfigurationError in production when secret is missing, short, or dev fallback", () => {
    expect(() =>
      resolveBYOKSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv)
    ).toThrow(BYOKConfigurationError)

    expect(() =>
      resolveBYOKSecret({
        NODE_ENV: "production",
        BYOK_COOKIE_SECRET: "too-short",
      } as NodeJS.ProcessEnv)
    ).toThrow(BYOKConfigurationError)

    expect(() =>
      resolveBYOKSecret({
        NODE_ENV: "development",
        VERCEL: "1",
        BYOK_COOKIE_SECRET:
          "diffly-dev-byok-cookie-secret-change-in-production-only",
      } as NodeJS.ProcessEnv)
    ).toThrow(BYOKConfigurationError)

    expect(() =>
      resolveBYOKSecret({
        NODE_ENV: "development",
        VERCEL: "true",
        BYOK_COOKIE_SECRET: "   ",
      } as NodeJS.ProcessEnv)
    ).toThrow(BYOKConfigurationError)

    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")
    expect(unsealAICredential("v1.a.b.c")).toMatchObject({
      status: "misconfigured",
    })
  })

  it("re-validates unsealed credentials against production baseUrl rules", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv(
      "BYOK_COOKIE_SECRET",
      "prod-secret-at-least-32-characters-long-1234"
    )
    const sealed = sealAICredential({
      provider: "openai-compatible",
      model: "llama3",
      apiKey: "sk-test-1234567890",
      baseUrl: "http://localhost:11434/v1",
    })

    vi.stubEnv("NODE_ENV", "production")
    expect(unsealAICredential(sealed)).toEqual({ status: "invalid" })
  })

  it("uses deterministic dev fallback in non-production", () => {
    const keyA = resolveBYOKSecret({ NODE_ENV: "test" } as NodeJS.ProcessEnv)
    const keyB = resolveBYOKSecret({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv)
    expect(keyA).toHaveLength(32)
    expect(keyA.equals(keyB)).toBe(true)
  })

  it("masks api keys and omits raw apiKey from connection metadata", () => {
    expect(maskApiKey("sk-proj-1234567890abcd")).toBe("sk-p••••abcd")
    expect(maskApiKey("short")).toBe("••••")

    const rawKey = "sk-ant-very-secret-key-9999"
    const metadata = toConnectionMetadata({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: rawKey,
    })

    expect(metadata).toEqual({
      connected: true,
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      maskedKey: "sk-a••••9999",
    })
    expect(JSON.stringify(metadata)).not.toContain(rawKey)
  })

  it("returns expected cookie options", () => {
    expect(BYOK_COOKIE_NAME).toBe("diffly_byok_ai")
    expect(BYOK_COOKIE_MAX_AGE_SECONDS).toBe(2_592_000)
    expect(
      getBYOKCookieOptions({ NODE_ENV: "test" } as NodeJS.ProcessEnv)
    ).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/api",
      maxAge: 2_592_000,
    })
    expect(
      getBYOKCookieOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv)
    ).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api",
      maxAge: 2_592_000,
    })
  })
})
