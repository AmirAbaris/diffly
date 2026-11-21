import fs from "node:fs/promises"
import path from "node:path"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { resolveBackendUrl } from "@/lib/config/api-rewrites"

const SAFE_SLUG_RE = /^[a-z0-9-]+$/i
const SAFE_SHARE_TOKEN_RE = /^[A-Za-z0-9._~-]{1,128}$/
const SAFE_COOKIE_VALUE_RE = /^[A-Za-z0-9._=-]+$/
const RESERVED_SLUGS = new Set([
  "custom",
  "evaluate-custom",
  "generate-custom",
  "next",
])
const CONTENT_CHALLENGES_ROOT = path.resolve(
  process.cwd(),
  "content",
  "challenges"
)

const FORWARDED_COOKIE_NAMES = new Set([
  "diffly_access_token",
  "diffly_guest_session",
])

export interface ResolvedChallengeMetadata {
  title: string
  description: string
  robots?: Metadata["robots"]
  referrer?: Metadata["referrer"]
}

export function formatSlugTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function summarizeDescription(
  rawDescription: string | undefined,
  challengeTitle: string
): string {
  const cleaned = (rawDescription ?? "")
    .replace(/[#`*>[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) {
    return `Review code diff, analyze agent flaws, and annotate vulnerabilities for ${challengeTitle}.`
  }
  if (cleaned.length <= 160) {
    return cleaned
  }
  return `${cleaned.slice(0, 157).trimEnd()}…`
}

function parseMetaYamlScalar(yamlContent: string, key: string): string | null {
  const lines = yamlContent.split(/\r?\n/)
  const keyPrefixRe = new RegExp(`^${key}:\\s*(.*)$`)

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(keyPrefixRe)
    if (!match) continue

    let first = match[1].trim()
    if (
      (first.startsWith('"') && first.endsWith('"')) ||
      (first.startsWith("'") && first.endsWith("'"))
    ) {
      first = first.slice(1, -1).trim()
      return first || null
    }

    const parts: string[] = []
    if (first && first !== ">" && first !== "|") {
      parts.push(first)
    }

    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j])) {
        parts.push(lines[j].trim())
      } else {
        break
      }
    }

    const combined = parts.join(" ").trim()
    return combined || null
  }

  return null
}

function isValidChallengeIdentifier(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= 128 &&
    SAFE_SLUG_RE.test(slug) &&
    !RESERVED_SLUGS.has(slug.toLowerCase())
  )
}

async function readLocalBundleMetadata(
  slug: string
): Promise<{ title: string; description: string } | null> {
  if (!isValidChallengeIdentifier(slug)) {
    return null
  }

  const bundleDir = path.resolve(CONTENT_CHALLENGES_ROOT, slug)
  if (!bundleDir.startsWith(`${CONTENT_CHALLENGES_ROOT}${path.sep}`)) {
    return null
  }

  const candidates = await Promise.all(
    ["meta.yaml", "meta.yml"].map(async (filename) => {
      try {
        return await fs.readFile(path.join(bundleDir, filename), "utf-8")
      } catch {
        return null
      }
    })
  )

  for (const content of candidates) {
    if (!content) continue
    const title = parseMetaYamlScalar(content, "title")
    if (!title) continue
    const defectTarget = parseMetaYamlScalar(content, "defect_target")
    return {
      title,
      description: summarizeDescription(defectTarget ?? undefined, title),
    }
  }

  return null
}

function resolveMetadataBackendOrigin(): string | null {
  const resolved = resolveBackendUrl(process.env)
  if (resolved) {
    return resolved.replace(/\/+$/, "")
  }
  const vercelUrl = process.env.VERCEL_URL?.trim().replace(/\/+$/, "")
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
  }
  return null
}

async function buildForwardedCookieHeader(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies()
    const pairs: string[] = []
    for (const cookie of cookieStore.getAll()) {
      if (
        FORWARDED_COOKIE_NAMES.has(cookie.name) &&
        cookie.value &&
        SAFE_COOKIE_VALUE_RE.test(cookie.value)
      ) {
        pairs.push(`${cookie.name}=${cookie.value}`)
      }
    }
    return pairs.length > 0 ? pairs.join("; ") : undefined
  } catch {
    return undefined
  }
}

export async function resolveChallengeMetadata(
  slug: string,
  shareToken?: string
): Promise<ResolvedChallengeMetadata> {
  const fallbackTitle = formatSlugTitle(slug) || "Challenge"
  const unlistedDirectives: Pick<
    ResolvedChallengeMetadata,
    "robots" | "referrer"
  > = shareToken
    ? {
        robots: { index: false, follow: false },
        referrer: "no-referrer",
      }
    : {}

  const fallbackMetadata: ResolvedChallengeMetadata = {
    title: `${fallbackTitle} - Arena`,
    description: `Review code diff, analyze agent flaws, and annotate vulnerabilities for ${fallbackTitle}.`,
    ...unlistedDirectives,
  }

  if (!isValidChallengeIdentifier(slug)) {
    return fallbackMetadata
  }

  const validShareToken =
    shareToken && SAFE_SHARE_TOKEN_RE.test(shareToken) ? shareToken : undefined

  const backendOrigin = resolveMetadataBackendOrigin()
  if (backendOrigin) {
    try {
      const qs = validShareToken
        ? `?share_token=${encodeURIComponent(validShareToken)}`
        : ""
      const url = `${backendOrigin}/api/challenges/${encodeURIComponent(slug)}${qs}`
      const cookieHeader = await buildForwardedCookieHeader()
      const headers: HeadersInit = cookieHeader ? { Cookie: cookieHeader } : {}

      const response = await fetch(url, {
        headers,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(1500),
      })

      if (response.ok) {
        const data = (await response.json()) as {
          title?: string
          description?: string
          is_public?: boolean
        }
        if (typeof data.title === "string" && data.title.trim()) {
          const realTitle = data.title.trim()
          const privacyDirectives: Pick<
            ResolvedChallengeMetadata,
            "robots" | "referrer"
          > =
            data.is_public === false || Boolean(shareToken)
              ? {
                  robots: { index: false, follow: false },
                  referrer: "no-referrer",
                }
              : {}
          return {
            title: `${realTitle} - Arena`,
            description: summarizeDescription(data.description, realTitle),
            ...privacyDirectives,
          }
        }
      } else if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        return fallbackMetadata
      }
    } catch {
      // Backend unreachable (e.g. during build or cold boot); fall back to curated bundle
    }
  }

  const bundleMeta = await readLocalBundleMetadata(slug)
  if (bundleMeta) {
    return {
      title: `${bundleMeta.title} - Arena`,
      description: bundleMeta.description,
      ...unlistedDirectives,
    }
  }

  return fallbackMetadata
}
