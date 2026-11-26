import { NextRequest, NextResponse } from "next/server"

import {
  BYOK_COOKIE_NAME,
  BYOKConfigurationError,
  getBYOKCookieOptions,
  resolveBYOKSecret,
  sealAICredential,
  toConnectionMetadata,
  unsealAICredential,
} from "@/lib/ai/cookie"
import {
  isCrossSiteRequest,
  noStoreJson,
  requireJsonContentType,
} from "@/lib/ai/http"
import { parseCredentialInput, verifyBYOKConnection } from "@/lib/ai/provider"

const GENERIC_CONFIG_ERROR = "AI connection service is not configured."

function clearBYOKCookie(response: NextResponse): void {
  const options = getBYOKCookieOptions()
  response.cookies.set(BYOK_COOKIE_NAME, "", {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: 0,
  })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawCookie = request.cookies.get(BYOK_COOKIE_NAME)?.value
  const result = unsealAICredential(rawCookie)

  if (result.status === "misconfigured") {
    return noStoreJson({ error: GENERIC_CONFIG_ERROR }, 500)
  }

  if (result.status === "missing" || result.status === "invalid") {
    return noStoreJson({ connected: false })
  }

  return noStoreJson(toConnectionMetadata(result.credential))
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return noStoreJson({ error: "Cross-site requests are not allowed." }, 403)
  }

  const contentTypeError = requireJsonContentType(request)
  if (contentTypeError) {
    return contentTypeError
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: "Invalid JSON request body." }, 400)
  }

  const parsed = parseCredentialInput(body)
  if (!parsed.ok) {
    return noStoreJson({ error: parsed.message }, 400)
  }

  try {
    resolveBYOKSecret()
  } catch (error) {
    if (error instanceof BYOKConfigurationError) {
      return noStoreJson({ error: GENERIC_CONFIG_ERROR }, 500)
    }
    throw error
  }

  const verification = await verifyBYOKConnection(parsed.value, {
    signal: request.signal,
  })
  if (!verification.ok) {
    return noStoreJson({ error: verification.message }, verification.status)
  }

  let sealed: string
  try {
    sealed = sealAICredential(parsed.value)
  } catch (error) {
    if (error instanceof BYOKConfigurationError) {
      return noStoreJson({ error: GENERIC_CONFIG_ERROR }, 500)
    }
    throw error
  }

  const response = noStoreJson(toConnectionMetadata(parsed.value))
  response.cookies.set(BYOK_COOKIE_NAME, sealed, getBYOKCookieOptions())
  return response
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return noStoreJson({ error: "Cross-site requests are not allowed." }, 403)
  }

  const response = noStoreJson({ connected: false })
  clearBYOKCookie(response)
  return response
}
