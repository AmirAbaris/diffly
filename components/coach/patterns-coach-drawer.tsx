"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Settings } from "lucide-react"
import { PATTERNS_QUICK_PROMPTS } from "@/components/coach/use-coach-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { formatAIConnectionSummary } from "@/lib/ai/catalog"

export function PatternsCoachDrawer() {
  const connection = useAIConnection()
  const connectionSummary = formatAIConnectionSummary(connection)

  return (
    <Card
      data-testid="patterns-coach-drawer"
      className="gap-0 overflow-hidden py-0"
    >
      <CardContent className="flex flex-col gap-3.5 px-4 py-4 sm:px-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Analyze My Patterns
              </span>
              <Badge variant="secondary" size="sm">
                Agent Coach
              </Badge>
              {!connection.isLoading && connectionSummary ? (
                <Badge
                  variant="success"
                  size="sm"
                  data-testid="patterns-coach-connected-badge"
                  className="font-mono"
                >
                  {connectionSummary}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Inspect blind spots across your review history and launch a
              targeted drill in the full Coach workspace.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!connection.isLoading && !connection.isConnected ? (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href="/settings"
                  data-testid="patterns-coach-settings-link"
                >
                  <Settings data-icon="inline-start" aria-hidden="true" />
                  <span>Connect AI in Settings</span>
                </Link>
              </Button>
            ) : null}
            <Button size="sm" asChild>
              <Link href="/coach" data-testid="patterns-coach-open-link">
                <span>Open Agent Coach</span>
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div
          data-testid="patterns-coach-quick-links"
          className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3"
        >
          {PATTERNS_QUICK_PROMPTS.map((chip) => (
            <Button
              key={chip.id}
              variant="outline"
              size="xs"
              asChild
              className="rounded-full"
            >
              <Link
                href={`/coach?prompt=${encodeURIComponent(chip.prompt)}`}
                data-testid={`patterns-coach-prompt-${chip.id}`}
              >
                <span>{chip.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
