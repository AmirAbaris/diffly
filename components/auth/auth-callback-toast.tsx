"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useSWRConfig } from "swr"
import { toast } from "@/hooks/use-toast"
import { revalidateAllAuthCaches } from "@/lib/auth"

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  github_denied: "GitHub sign-in was cancelled.",
  github_state:
    "GitHub sign-in expired or failed state verification. Please try again.",
  github_failed:
    "GitHub sign-in failed. Please try again or sign in with your password.",
  github_email_in_use:
    "An account with this email exists — sign in with your password, then connect GitHub from Settings",
  github_already_linked:
    "This GitHub account is already linked to another Diffly account.",
  account_inactive: "This account is inactive and cannot sign in.",
  github_unavailable: "GitHub OAuth is currently unavailable.",
}

function getAuthCallbackErrorMessage(code: string): string {
  return (
    AUTH_ERROR_MESSAGES[code] ??
    "Authentication failed. Please try signing in again."
  )
}

export function AuthCallbackToast() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { mutate } = useSWRConfig()
  const handledSignatureRef = React.useRef<string | null>(null)

  const authStatus = searchParams.get("auth")
  const authError = searchParams.get("auth_error")
  const claimStatus = searchParams.get("claim_status")

  React.useEffect(() => {
    if (!authStatus && !authError && !claimStatus) {
      return
    }

    const signature = `${authStatus ?? ""}|${authError ?? ""}|${claimStatus ?? ""}`
    if (handledSignatureRef.current === signature) {
      return
    }
    handledSignatureRef.current = signature

    if (authError) {
      toast({
        title: "GitHub authentication failed",
        description: getAuthCallbackErrorMessage(authError),
        variant: "destructive",
      })
    } else if (authStatus === "github_success") {
      void revalidateAllAuthCaches(mutate)
      toast({
        title: "Signed in with GitHub",
        description: "Your GitHub account session is active.",
        variant: "success",
      })
    }

    if (claimStatus === "quota_exceeded") {
      toast({
        title: "Guest custom challenges kept separate",
        description:
          "Merging your guest custom challenges would exceed the 5-challenge limit. Delete an existing custom challenge to free space.",
        variant: "destructive",
      })
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("auth")
    nextParams.delete("auth_error")
    nextParams.delete("claim_status")
    const queryString = nextParams.toString()
    const basePath = pathname || "/"
    const nextUrl = queryString ? `${basePath}?${queryString}` : basePath
    window.history.replaceState(window.history.state, "", nextUrl)
  }, [authStatus, authError, claimStatus, searchParams, pathname, mutate])

  return null
}
