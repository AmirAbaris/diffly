export function buildChallengeSharePath(
  slug: string,
  shareToken: string
): string {
  const params = new URLSearchParams({ share_token: shareToken })
  return `/challenges/${encodeURIComponent(slug)}?${params.toString()}`
}

export function buildChallengeShareUrl(
  slug: string,
  shareToken: string,
  origin?: string
): string {
  const path = buildChallengeSharePath(slug, shareToken)
  if (origin) {
    return `${origin.replace(/\/+$/, "")}${path}`
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

export function appendShareTokenQuery(
  url: string,
  shareToken?: string | null
): string {
  if (!shareToken) {
    return url
  }
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}share_token=${encodeURIComponent(shareToken)}`
}
