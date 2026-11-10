import * as React from "react"
import { Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-4" />
          </div>
          <h2
            id="scenario-overview-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Scenario Overview
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[11px] font-medium capitalize"
          >
            {challenge.difficulty}
          </Badge>
          <Badge variant="secondary" className="text-[11px] font-medium">
            {challenge.category}
          </Badge>
        </div>
      </div>

      <Card className="border-border/80 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Operational Context & Role
          </CardTitle>
          <CardDescription className="sr-only">
            Autonomous agent description and operational context
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <MarkdownTypography
            content={challenge.description}
            className="text-foreground/90"
          />
        </CardContent>
      </Card>
    </section>
  )
}
