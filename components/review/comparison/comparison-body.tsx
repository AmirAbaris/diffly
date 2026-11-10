import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChallengeSolutionResponse } from "@/types/challenge"
import { CodeDiffViewer } from "./code-diff-viewer"
import { StaffReviewColumn } from "./staff-review-column"
import { UserReviewColumn } from "./user-review-column"

export interface ComparisonBodyProps {
  isLoading: boolean
  errorMessage: string | null
  activeTab: "comparison" | "diff"
  userFlaggedLines: number[]
  userComments: string
  solution: ChallengeSolutionResponse | null
  onRetry: () => void
  onTabChange: (tab: "comparison" | "diff") => void
}

export function ComparisonBody({
  isLoading,
  errorMessage,
  activeTab,
  userFlaggedLines,
  userComments,
  solution,
  onRetry,
  onTabChange,
}: ComparisonBodyProps) {
  if (isLoading) {
    return (
      <div
        data-testid="comparison-loading-state"
        className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center"
      >
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Loading canonical review and expert fix…
        </p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        data-testid="comparison-error-state"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle className="size-5 text-destructive" />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-destructive">
            Could not load canonical solution
          </span>
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className="size-3" />
          <span>Try Again</span>
        </Button>
      </div>
    )
  }

  if (activeTab === "diff") {
    return <CodeDiffViewer rawDiff={solution?.recommended_fix_diff} />
  }

  return (
    <div
      data-testid="comment-comparison-layout"
      className="grid grid-cols-1 gap-5 lg:grid-cols-2"
    >
      <UserReviewColumn
        flaggedLines={userFlaggedLines}
        comments={userComments}
      />
      <StaffReviewColumn
        solution={solution}
        onOpenDiff={() => onTabChange("diff")}
      />
    </div>
  )
}
