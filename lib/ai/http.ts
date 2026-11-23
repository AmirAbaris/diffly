import { NextRequest, NextResponse } from "next/server"

export function noStoreJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Cookie",
    },
  })
}

export function isCrossSiteRequest(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return true
  }

  const origin = request.headers.get("origin")
  if (!origin) {
    return false
  }

  const expectedHost = request.headers.get("host") ?? request.nextUrl.host
  try {
    return new URL(origin).host !== expectedHost
  } catch {
    return true
  }
}

export function requireJsonContentType(
  request: NextRequest
): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "Content-Type must be application/json." }, 415)
  }

  return null
}
