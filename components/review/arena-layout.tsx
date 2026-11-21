"use client"

import * as React from "react"
import { ArenaErrorView } from "@/components/review/arena-error-view"
import { ArenaLoadingShell } from "@/components/review/arena-loading-shell"
import { ArenaWorkspace } from "@/components/review/arena-workspace"
import { ShareTokenProvider } from "@/components/review/share-token-context"
import { useChallengeSession } from "@/hooks/use-challenge-session"

export interface ArenaLayoutProps {
  slug: string
  shareToken?: string
}

export function ArenaLayout({ slug, shareToken }: ArenaLayoutProps) {
  const session = useChallengeSession(slug, shareToken)

  switch (session.status) {
    case "loading":
      return <ArenaLoadingShell />
    case "error":
      return (
        <ArenaErrorView
          slug={slug}
          error={session.error}
          onRetry={session.retry}
        />
      )
    case "ready":
      return (
        <ShareTokenProvider slug={slug} shareToken={shareToken ?? null}>
          <ArenaWorkspace key={session.challenge.slug} session={session} />
        </ShareTokenProvider>
      )
  }
}
