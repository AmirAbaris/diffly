import * as React from "react"
import { Lock, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ChallengeDetail } from "@/types/challenge"
import { MarkdownTypography } from "./formatted-markdown"

export function ThreatModelSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  return (
    <section
      data-testid="section-threat-model"
      aria-labelledby="threat-model-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="size-4" />
          </div>
          <h2
            id="threat-model-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Threat Model & Invariants
          </h2>
        </div>
        <Badge
          variant="destructive"
          className="gap-1 text-[10px] font-semibold uppercase"
        >
          <Lock className="size-2.5" />
          Security Invariant
        </Badge>
      </div>

      <Card className="border-destructive/25 bg-destructive/[0.03] dark:bg-destructive/[0.08]">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <ShieldAlert className="size-4 shrink-0" />
            <span>Untrusted Inputs & Boundary Risks</span>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-background/60 p-3 text-xs">
            <MarkdownTypography
              content={
                challenge.threat_model ||
                "Untrusted inputs or downstream tool returns may violate system boundary invariants. Ensure strict validation and permission isolation."
              }
              className="text-muted-foreground"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
