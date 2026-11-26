"use client"

import * as React from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  validateReview,
  type Finding,
  type FindingId,
  type ReviewDraft,
} from "@/lib/review"
import { cn } from "@/lib/utils"
import { FindingsOutline } from "./findings-outline"
import { SummaryNoteEditor } from "./summary-note-editor"

export interface ReviewSummaryPanelProps {
  draft: ReviewDraft
  onChangeSummaryNote: (note: string) => void
  onSelectFinding: (finding: Finding) => void
  onRemoveFinding: (id: FindingId) => void
  onOpenFlagGuide?: () => void
  disabled?: boolean
  className?: string
}

type SummaryOverride = "auto" | "open" | "closed"

export function ReviewSummaryPanel({
  draft,
  onChangeSummaryNote,
  onSelectFinding,
  onRemoveFinding,
  onOpenFlagGuide,
  disabled = false,
  className,
}: ReviewSummaryPanelProps) {
  const [summaryOverride, setSummaryOverride] =
    React.useState<SummaryOverride>("auto")

  const hasSummaryText = draft.summaryNote.trim().length > 0
  const summaryOpen =
    summaryOverride === "auto" ? hasSummaryText : summaryOverride === "open"

  const validation = React.useMemo(() => validateReview(draft), [draft])
  const hasMinText = !validation.blockers.includes("too-little-text")

  return (
    <div
      data-testid="review-summary-panel"
      className={cn("flex flex-col gap-3", className)}
    >
      <FindingsOutline
        findings={draft.findings}
        onSelectFinding={onSelectFinding}
        onRemoveFinding={onRemoveFinding}
        onOpenFlagGuide={onOpenFlagGuide}
        disabled={disabled}
      />

      <Collapsible
        open={summaryOpen}
        onOpenChange={(nextOpen) =>
          setSummaryOverride(nextOpen ? "open" : "closed")
        }
        className="flex flex-col gap-2"
      >
        <CollapsibleTrigger
          type="button"
          data-testid="toggle-summary-note"
          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            {summaryOpen ? (
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
            ) : (
              <Plus
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
            )}
            <span className="font-medium text-foreground">
              {summaryOpen || hasSummaryText
                ? "Overall summary"
                : "Add overall summary"}
            </span>
            <Badge variant="secondary" size="sm">
              {hasSummaryText && !summaryOpen ? "Added" : "Optional"}
            </Badge>
          </span>

          {!summaryOpen && (
            <span className="text-muted-foreground">
              {hasSummaryText
                ? "Click to view or edit"
                : "Not required when explained inline"}
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SummaryNoteEditor
            note={draft.summaryNote}
            onChangeNote={onChangeSummaryNote}
            remainingChars={validation.remainingChars}
            isMinLengthMet={hasMinText}
            disabled={disabled}
            placeholder="Optional: summarize overall risk, cross-cutting root cause, or remediation plan…"
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
