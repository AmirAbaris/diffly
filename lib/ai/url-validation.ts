const CONTROL_CHAR_REGEX = /[\r\n\0]/
export const MAX_MODEL_LENGTH = 200
export const MAX_API_KEY_LENGTH = 512
export const MAX_BASE_URL_LENGTH = 512

export function hasControlChars(value: string): boolean {
  return CONTROL_CHAR_REGEX.test(value)
}

export function isProductionRuntime(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.ENVIRONMENT === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL === "true"
  )
}

function parseIPv4Int(host: string): number | null {
  const parts = host.split(".")
  if (parts.length !== 4) return null

  let result = 0
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    result = ((result << 8) | octet) >>> 0
  }

  return result
}

function isBlockedIPv4Int(ip: number): boolean {
  const firstOctet = ip >>> 24
  if (firstOctet === 0 || firstOctet === 10 || firstOctet === 127) return true
  if (firstOctet >= 224) return true
  if ((ip & 0xffc00000) >>> 0 === 0x64400000) return true
  if (ip >>> 16 === 0xa9fe) return true
  if ((ip & 0xfff00000) >>> 0 === 0xac100000) return true
  if (ip >>> 16 === 0xc0a8) return true
  return false
}

function parseIPv6Groups(rawHost: string): Uint16Array | null {
  const host = rawHost.split("%")[0]
  if (!host.includes(":")) return null

  const doubleColonParts = host.split("::")
  if (doubleColonParts.length > 2) return null

  const parseSegment = (segment: string, allowTrailingIPv4: boolean) => {
    if (!segment) return [] as number[]
    const tokens = segment.split(":")
    const groups: number[] = []

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (allowTrailingIPv4 && i === tokens.length - 1 && token.includes(".")) {
        const ipv4 = parseIPv4Int(token)
        if (ipv4 === null) return null
        groups.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff)
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(token)) return null
        groups.push(Number.parseInt(token, 16))
      }
    }

    return groups
  }

  const hasCompression = doubleColonParts.length === 2
  const head = parseSegment(doubleColonParts[0], !hasCompression)
  if (!head) return null

  const tail = hasCompression ? parseSegment(doubleColonParts[1], true) : []
  if (!tail) return null

  const totalGroups = head.length + tail.length
  if (hasCompression ? totalGroups >= 8 : totalGroups !== 8) {
    return null
  }

  const result = new Uint16Array(8)
  result.set(head, 0)
  result.set(tail, 8 - tail.length)
  return result
}

function isBlockedIPv6Groups(groups: Uint16Array): boolean {
  const isAllZeroPrefix = (count: number) => {
    for (let i = 0; i < count; i += 1) {
      if (groups[i] !== 0) return false
    }
    return true
  }

  if (isAllZeroPrefix(7) && (groups[7] === 0 || groups[7] === 1)) {
    return true
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return true
  if ((groups[0] & 0xffc0) === 0xfe80) return true
  if ((groups[0] & 0xff00) === 0xff00) return true

  const isIPv4Mapped = isAllZeroPrefix(5) && groups[5] === 0xffff
  const isIPv4Compat = isAllZeroPrefix(6)
  const isNat64 =
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0

  if (isIPv4Mapped || isIPv4Compat || isNat64) {
    const embeddedIPv4 = ((groups[6] << 16) | groups[7]) >>> 0
    return isBlockedIPv4Int(embeddedIPv4)
  }

  return false
}

export function isBlockedIP(ip: string): boolean {
  const normalized = ip
    .replace(/^\[|\]$/g, "")
    .trim()
    .toLowerCase()
  const ipv4 = parseIPv4Int(normalized)
  if (ipv4 !== null) {
    return isBlockedIPv4Int(ipv4)
  }

  const ipv6 = parseIPv6Groups(normalized)
  if (ipv6 !== null) {
    return isBlockedIPv6Groups(ipv6)
  }

  return false
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase()

  if (!normalized) return true

  if (!normalized.includes(":") && !normalized.includes(".")) {
    return true
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true
  }

  return isBlockedIP(normalized)
}

export function validateBaseUrl(
  rawBaseUrl: unknown,
  required: boolean
): { ok: true; value?: string } | { ok: false; message: string } {
  if (rawBaseUrl === undefined || rawBaseUrl === null) {
    return required
      ? { ok: false, message: "Base URL is required for this provider." }
      : { ok: true, value: undefined }
  }

  if (typeof rawBaseUrl !== "string") {
    return { ok: false, message: "Base URL must be a string." }
  }

  if (hasControlChars(rawBaseUrl)) {
    return { ok: false, message: "Base URL contains invalid characters." }
  }

  const trimmed = rawBaseUrl.trim()
  if (!trimmed) {
    return required
      ? { ok: false, message: "Base URL is required for this provider." }
      : { ok: true, value: undefined }
  }

  if (trimmed.length > MAX_BASE_URL_LENGTH) {
    return {
      ok: false,
      message: `Base URL must be at most ${MAX_BASE_URL_LENGTH} characters.`,
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, message: "Base URL must be a valid URL." }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: "Base URL must not contain credentials." }
  }

  if (parsed.search || parsed.hash) {
    return {
      ok: false,
      message: "Base URL must not contain query parameters or fragments.",
    }
  }

  const inProduction = isProductionRuntime()
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "Base URL must use http or https." }
  }

  if (inProduction && parsed.protocol !== "https:") {
    return { ok: false, message: "Base URL must use https in production." }
  }

  const allowPrivate = process.env.BYOK_ALLOW_PRIVATE_BASE_URLS === "true"
  if (inProduction && !allowPrivate && isBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      message: "Private, loopback, and metadata base URLs are not allowed.",
    }
  }

  return { ok: true, value: parsed.toString().replace(/\/+$/, "") }
}
