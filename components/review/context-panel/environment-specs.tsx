import * as React from "react"
import { getRuntimeLabel } from "@/lib/languages/registry"
import type { ChallengeDetail } from "@/types/challenge"

export function EnvironmentSpecsSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  const runtimeLabel = getRuntimeLabel(challenge.language)

  return (
    <section
      data-testid="section-environment-specs"
      aria-labelledby="environment-specs-heading"
      className="flex flex-col gap-3"
    >
      <h2
        id="environment-specs-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Execution Specs & Rules
      </h2>

      <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-1 p-3">
          <span className="text-xs text-muted-foreground">Runtime</span>
          <span className="text-xs font-semibold text-foreground">
            {runtimeLabel}
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <span className="text-xs text-muted-foreground">Review Est.</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            ~{challenge.estimated_minutes} min
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <span className="text-xs text-muted-foreground">Target Code</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {challenge.file_count && challenge.file_count > 1
              ? `${challenge.file_count} files · ${challenge.line_count} lines`
              : `${challenge.line_count} lines`}
          </span>
        </div>
      </div>
    </section>
  )
}
