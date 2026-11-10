import * as React from "react"
import { Badge } from "@/components/ui/badge"
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
      className="flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <h2
          id="threat-model-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Threat Model &amp; Invariants
        </h2>
        <Badge variant="destructive">Security Invariant</Badge>
      </div>

      <div className="rounded-lg border border-destructive/25 bg-destructive/[0.03] p-4 dark:bg-destructive/[0.07]">
        <MarkdownTypography
          content={
            challenge.threat_model ||
            "Untrusted inputs or downstream tool returns may violate system boundary invariants. Ensure strict validation and permission isolation."
          }
          className="text-foreground/90"
        />
      </div>
    </section>
  )
}
