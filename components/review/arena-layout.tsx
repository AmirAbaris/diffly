"use client"

import * as React from "react"
import { ArenaErrorView } from "@/components/review/arena-error-view"
import { ArenaLoadingShell } from "@/components/review/arena-loading-shell"
import { ArenaWorkspace } from "@/components/review/arena-workspace"
import { useChallengeSession } from "@/hooks/use-challenge-session"

export interface ArenaLayoutProps {
  slug: string
}

export function ArenaLayout({ slug }: ArenaLayoutProps) {
  const session = useChallengeSession(slug)

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
      return <ArenaWorkspace key={session.challenge.slug} session={session} />
  }
}
