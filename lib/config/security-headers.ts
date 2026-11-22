export interface SecurityHeadersEnv {
  NODE_ENV?: string
  VERCEL?: string
  COOKIE_SECURE?: string
}

export interface NextHeaderItem {
  key: string
  value: string
}

export interface NextHeaderRule {
  source: string
  headers: NextHeaderItem[]
}

/**
 * Builds the Content-Security-Policy header value for Next.js responses.
 *
 * `upgrade-insecure-requests` is omitted on plain HTTP (e.g. local `next start`
 * and Playwright E2E) so browsers do not upgrade localhost asset requests to HTTPS.
 */
export function buildContentSecurityPolicy(
  env: SecurityHeadersEnv = process.env
): string {
  const isDev = env.NODE_ENV === "development"
  const isHttps =
    env.VERCEL === "1" || env.VERCEL === "true" || env.COOKIE_SECURE === "true"

  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"

  const connectSrc = isDev
    ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"
    : "connect-src 'self'"

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    connectSrc,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]

  if (isHttps) {
    directives.push("upgrade-insecure-requests")
  }

  return directives.join("; ")
}

/**
 * Builds the Next.js `headers()` rule array applying CSP and baseline security headers to all routes.
 */
export function buildSecurityHeaders(
  env: SecurityHeadersEnv = process.env
): NextHeaderRule[] {
  return [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: buildContentSecurityPolicy(env),
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ]
}
