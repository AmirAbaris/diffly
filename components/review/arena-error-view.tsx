"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  FileQuestion,
  Lock,
  RotateCcw,
  WifiOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type {
  ChallengeLoadError,
  ChallengeLoadErrorKind,
} from "@/types/arena-session"

export interface ArenaErrorViewProps {
  slug: string
  error: ChallengeLoadError
  onRetry: () => void
}

function ErrorIcon({ kind }: { kind: ChallengeLoadErrorKind }) {
  switch (kind) {
    case "not-found":
      return <FileQuestion aria-hidden="true" />
    case "unauthorized":
      return <Lock aria-hidden="true" />
    case "network":
      return <WifiOff aria-hidden="true" />
    case "server":
      return <AlertTriangle aria-hidden="true" />
  }
}

export function ArenaErrorView({ slug, error, onRetry }: ArenaErrorViewProps) {
  return (
    <div
      data-testid="arena-error-view"
      className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/challenges">
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              <span className="font-medium">Catalog</span>
            </Link>
          </Button>
          <span aria-hidden="true" className="text-sm text-border select-none">
            /
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {slug}
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md border border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ErrorIcon kind={error.kind} />
            </EmptyMedia>
            <EmptyTitle>{error.title}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {error.retryable && (
                <Button type="button" size="sm" onClick={onRetry}>
                  <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  Try Again
                </Button>
              )}
              <Button
                asChild
                size="sm"
                variant={error.retryable ? "outline" : "default"}
              >
                <Link href="/challenges">
                  <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                  Back to Catalog
                </Link>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  )
}
