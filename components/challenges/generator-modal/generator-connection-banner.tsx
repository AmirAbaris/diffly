"use client"

import Link from "next/link"
import { Key, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export interface GeneratorConnectionBannerProps {
  isLoading: boolean
  isConnected: boolean
  summary: string | null
  onNavigateSettings: () => void
}

export function GeneratorConnectionBanner({
  isLoading,
  isConnected,
  summary,
  onNavigateSettings,
}: GeneratorConnectionBannerProps) {
  if (isLoading) {
    return (
      <Skeleton
        data-testid="generator-ai-status-skeleton"
        className="h-14 w-full rounded-lg"
      />
    )
  }

  if (isConnected && summary) {
    return (
      <div
        data-testid="generator-ai-connected-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
      >
        <Badge
          variant="success"
          data-testid="generator-ai-status-pill"
          className="font-mono"
        >
          Connected: {summary}
        </Badge>
        <Link
          href="/settings"
          onClick={onNavigateSettings}
          data-testid="generator-manage-settings-link"
          className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          <Settings aria-hidden="true" className="size-3.5" />
          <span>Manage in Settings</span>
        </Link>
      </div>
    )
  }

  return (
    <div
      data-testid="generator-ai-disconnected-cta"
      className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-2.5">
        <Key
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">
            Connect an AI provider to generate challenges
          </span>
          <p className="leading-relaxed text-muted-foreground">
            Configure Google Gemini, OpenAI, Anthropic, or an OpenAI-compatible
            key once in Settings.
          </p>
        </div>
      </div>
      <Button variant="outline" size="xs" asChild className="shrink-0">
        <Link
          href="/settings"
          onClick={onNavigateSettings}
          data-testid="generator-configure-settings-link"
        >
          <Settings data-icon="inline-start" aria-hidden="true" />
          <span>Configure in Settings</span>
        </Link>
      </Button>
    </div>
  )
}
