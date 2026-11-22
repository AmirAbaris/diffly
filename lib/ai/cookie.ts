import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"

import {
  sanitizeCredential,
  type AIProviderId,
  type SealedAICredential,
} from "@/lib/ai/provider"

export const BYOK_COOKIE_NAME = "diffly_byok_ai"
export const BYOK_COOKIE_MAX_AGE_SECONDS = 2_592_000

const COOKIE_VERSION = "v1"
const COOKIE_AAD = Buffer.from("diffly-byok-cookie-v1", "utf8")
const COOKIE_HKDF_SALT = "diffly-byok-salt-v1"
const COOKIE_HKDF_INFO = "diffly-byok-cookie-v1"
const DEV_FALLBACK_SECRET =
  "diffly-dev-byok-cookie-secret-change-in-production-only"
const MIN_SECRET_LENGTH = 32
const KEY_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

export interface AIConnectionMetadata {
  connected: boolean
  provider?: AIProviderId
  model?: string
  baseUrl?: string
  maskedKey?: string
}

export type UnsealCredentialResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "misconfigured"; message: string }
  | { status: "valid"; credential: SealedAICredential }

export class BYOKConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BYOKConfigurationError"
  }
}

export function isProductionOrSecureCookie(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.ENVIRONMENT === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL === "true" ||
    env.COOKIE_SECURE === "true"
  )
}

export function resolveBYOKSecret(
  env: NodeJS.ProcessEnv = process.env
): Buffer {
  const configured = env.BYOK_COOKIE_SECRET?.trim()
  const inProduction = isProductionOrSecureCookie(env)

  if (inProduction) {
    if (!configured || configured.length < MIN_SECRET_LENGTH) {
      throw new BYOKConfigurationError(
        "BYOK_COOKIE_SECRET must be set to at least 32 characters in production."
      )
    }

    if (configured === DEV_FALLBACK_SECRET) {
      throw new BYOKConfigurationError(
        "BYOK_COOKIE_SECRET must not use the development fallback in production."
      )
    }
  }

  const secret =
    configured && configured.length > 0 ? configured : DEV_FALLBACK_SECRET
  return Buffer.from(
    hkdfSync("sha256", secret, COOKIE_HKDF_SALT, COOKIE_HKDF_INFO, KEY_BYTES)
  )
}

export function sealAICredential(credential: SealedAICredential): string {
  const key = resolveBYOKSecret()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(COOKIE_AAD)

  const plaintext = Buffer.from(JSON.stringify(credential), "utf8")
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    COOKIE_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function unsealAICredential(
  rawCookie: string | undefined
): UnsealCredentialResult {
  if (!rawCookie) {
    return { status: "missing" }
  }

  let key: Buffer
  try {
    key = resolveBYOKSecret()
  } catch (error) {
    if (error instanceof BYOKConfigurationError) {
      return { status: "misconfigured", message: error.message }
    }
    throw error
  }

  const parts = rawCookie.split(".")
  if (parts.length !== 4 || parts[0] !== COOKIE_VERSION) {
    return { status: "invalid" }
  }

  try {
    const iv = Buffer.from(parts[1], "base64url")
    const tag = Buffer.from(parts[2], "base64url")
    const encrypted = Buffer.from(parts[3], "base64url")

    if (
      iv.length !== IV_BYTES ||
      tag.length !== AUTH_TAG_BYTES ||
      encrypted.length === 0
    ) {
      return { status: "invalid" }
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    })
    decipher.setAuthTag(tag)
    decipher.setAAD(COOKIE_AAD)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8")

    const parsed: unknown = JSON.parse(decrypted)
    const sanitized = sanitizeCredential(parsed)
    if (!sanitized.ok) {
      return { status: "invalid" }
    }

    return {
      status: "valid",
      credential: sanitized.value,
    }
  } catch {
    return { status: "invalid" }
  }
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length >= 10) {
    return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
  }
  return "••••"
}

export function toConnectionMetadata(
  credential: SealedAICredential
): AIConnectionMetadata {
  return {
    connected: true,
    provider: credential.provider,
    model: credential.model,
    ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
    maskedKey: maskApiKey(credential.apiKey),
  }
}

export function getBYOKCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    secure: isProductionOrSecureCookie(env),
    sameSite: "lax" as const,
    path: "/api",
    maxAge: BYOK_COOKIE_MAX_AGE_SECONDS,
  }
}
