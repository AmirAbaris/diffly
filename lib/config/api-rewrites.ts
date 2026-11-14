export interface RewriteEnv {
  BACKEND_URL?: string
  NODE_ENV?: string
  VERCEL?: string
}

export interface NextRewriteRule {
  source: string
  destination: string
}

/**
 * Pure helper resolving the target upstream backend URL for Next.js API rewrites.
 *
 * Routing matrix:
 * 1. If explicit `BACKEND_URL` is set, normalize and return its origin.
 * 2. If running on Vercel (`VERCEL="1"`) without an external `BACKEND_URL`, return `null`
 *    so Next.js does NOT rewrite to `http://backend:8000` (which is a Docker hostname),
 *    allowing Vercel's native serverless function routing (`/api/(.*)` -> `api/index.py`) to handle it.
 * 3. If `NODE_ENV === "development"`, return `"http://127.0.0.1:8000"`.
 * 4. Otherwise (standalone Docker container production mode), return `"http://backend:8000"`.
 */
export function resolveBackendUrl(
  env: RewriteEnv = process.env
): string | null {
  const explicitBackend = env.BACKEND_URL?.trim()
  if (explicitBackend) {
    return explicitBackend.replace(/\/+$/, "")
  }

  const isVercel = env.VERCEL === "1" || env.VERCEL === "true"
  if (isVercel) {
    return null
  }

  if (env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000"
  }

  return "http://backend:8000"
}

/**
 * Builds the rewrite rule array for Next.js `rewrites()`.
 * Returns `[]` if `resolveBackendUrl(env)` resolves to `null`.
 */
export function buildApiRewrites(
  env: RewriteEnv = process.env
): NextRewriteRule[] {
  const backendUrl = resolveBackendUrl(env)
  if (!backendUrl) {
    return []
  }

  return [
    {
      source: "/api/:path*",
      destination: `${backendUrl}/api/:path*`,
    },
  ]
}
