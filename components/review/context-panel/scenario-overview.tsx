import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { ChallengeDetail } from "@/types/challenge"
import { MarkdownTypography } from "./formatted-markdown"

export function ScenarioOverviewSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  return (
    <section
      data-testid="section-scenario-overview"
      aria-labelledby="scenario-overview-heading"
      className="flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <h2
          id="scenario-overview-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Scenario Overview
        </h2>
        <div className="flex items-center gap-1.5 lg:hidden">
          <Badge variant="outline" className="capitalize">
            {challenge.difficulty}
          </Badge>
          <Badge variant="secondary">{challenge.category}</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <MarkdownTypography
          content={challenge.description}
          className="text-foreground/90"
        />
      </div>
    </section>
  )
}
