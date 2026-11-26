"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { GitHubIcon } from "@/components/brand/github-icon"
import { Button } from "@/components/ui/button"
import { useAuthProviders } from "@/hooks/use-auth-providers"
import { cn } from "@/lib/utils"

export interface GitHubOAuthButtonProps {
  nextPath?: string
  label?: string
  className?: string
  testId?: string
}

function resolveSafeNextPath(
  explicitPath?: string,
  hookPathname?: string | null
): string {
  const candidate =
    explicitPath ??
    hookPathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/")

  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/"
  }
  return candidate
}

export function GitHubOAuthButton({
  nextPath,
  label = "Continue with GitHub",
  className,
  testId = "github-oauth-button",
}: GitHubOAuthButtonProps) {
  const { githubEnabled } = useAuthProviders()
  const pathname = usePathname()

  if (!githubEnabled) {
    return null
  }

  const safeNext = resolveSafeNextPath(nextPath, pathname)
  const href = `/api/auth/github/login?next=${encodeURIComponent(safeNext)}`

  return (
    <Button
      variant="outline"
      className={cn("w-full gap-2 text-xs font-medium", className)}
      asChild
    >
      <a href={href} data-testid={testId}>
        <GitHubIcon />
        <span>{label}</span>
      </a>
    </Button>
  )
}
