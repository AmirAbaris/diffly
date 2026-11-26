import { type NextRequest } from "next/server"

import { resolveBackendUrl } from "@/lib/config/api-rewrites"

const ALLOWLISTED_BACKEND_COOKIE_NAMES = new Set([
  "diffly_access_token",
  "diffly_guest_session",
])

export function resolveInternalBackendOrigin(
  request?: NextRequest
): string | null {
  const resolved = resolveBackendUrl(process.env)
  if (resolved) {
    return resolved.replace(/\/+$/, "")
  }

  const vercelUrl = process.env.VERCEL_URL?.trim().replace(/\/+$/, "")
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
  }

  if (request?.nextUrl.origin) {
    return request.nextUrl.origin.replace(/\/+$/, "")
  }

  return null
}

export function buildAllowlistedBackendCookieHeader(
  cookies: ReadonlyArray<{ name: string; value: string }>
): string | undefined {
  const pairs: string[] = []
  for (const cookie of cookies) {
    if (
      ALLOWLISTED_BACKEND_COOKIE_NAMES.has(cookie.name) &&
      cookie.value &&
      !/[\r\n\0;]/.test(cookie.value)
    ) {
      pairs.push(`${cookie.name}=${cookie.value}`)
    }
  }

  return pairs.length > 0 ? pairs.join("; ") : undefined
}

export function propagateBackendSetCookies(
  backendHeaders: Headers,
  response: Response
): void {
  const setCookies = backendHeaders.getSetCookie?.() ?? []
  for (const cookie of setCookies) {
    const eqIndex = cookie.indexOf("=")
    if (eqIndex <= 0) {
      continue
    }
    const cookieName = cookie.slice(0, eqIndex).trim()
    if (ALLOWLISTED_BACKEND_COOKIE_NAMES.has(cookieName)) {
      response.headers.append("set-cookie", cookie)
    }
  }
}
