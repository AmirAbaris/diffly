"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatAnchor, type Finding, type FindingId } from "@/lib/review"

export interface FindingsOutlineProps {
  findings: readonly Finding[]
  onSelectFinding: (finding: Finding) => void
  onRemoveFinding: (id: FindingId) => void
  onOpenFlagGuide?: () => void
  disabled?: boolean
}

export function FindingsOutline({
  findings,
  onSelectFinding,
  onRemoveFinding,
  onOpenFlagGuide,
  disabled = false,
}: FindingsOutlineProps) {
  if (findings.length === 0) {
    return (
      <div
        data-testid="flagged-lines-container"
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <span>
          No findings flagged yet. Click line numbers or press{" "}
          <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] text-foreground">
            f
          </kbd>{" "}
          to flag a line,{" "}
          <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] text-foreground">
            ?
          </kbd>{" "}
          for shortcuts.
        </span>
        {onOpenFlagGuide && (
          <button
            type="button"
            onClick={onOpenFlagGuide}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid="flag-strip-guide-button"
          >
            See guide
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      data-testid="flagged-lines-container"
      className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2.5 text-xs"
    >
      <div className="flex items-center justify-between px-1">
        <span className="font-medium text-foreground">
          Findings ({findings.length})
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {findings.map((finding) => {
          const anchorLabel = formatAnchor(finding.anchor)
          return (
            <div
              key={finding.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => onSelectFinding(finding)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Badge
                  variant="warning"
                  size="sm"
                  className="shrink-0 font-mono tabular-nums"
                >
                  {anchorLabel}
                </Badge>
                {finding.severity && (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="shrink-0 uppercase"
                  >
                    {finding.severity}
                  </Badge>
                )}
                <span className="truncate text-foreground">
                  {finding.body.trim()
                    ? finding.body
                    : "Click to add inline note"}
                </span>
              </button>

              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                onClick={() => onRemoveFinding(finding.id)}
                aria-label={`Remove finding ${anchorLabel}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
