import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GradeReport } from "@/lib/review"
import type {
  ChallengeFile,
  ChallengeSolutionResponse,
  FlaggedLine,
} from "@/types/challenge"
import { AnnotatedCodeTab } from "./annotated-code-tab"
import { CodeDiffViewer } from "./code-diff-viewer"
import { StaffReviewColumn } from "./staff-review-column"
import { UserReviewColumn } from "./user-review-column"

export type ComparisonTab = "comparison" | "diff" | "annotated"

export interface ComparisonBodyProps {
  isLoading: boolean
  errorMessage: string | null
  activeTab: ComparisonTab
  userFlaggedLines: FlaggedLine[]
  userComments: string
  solution: ChallengeSolutionResponse | null
  codeSnippet?: string
  files?: ChallengeFile[]
  gradeReport?: GradeReport | null
  language?: string
  onRetry: () => void
  onTabChange: (tab: ComparisonTab) => void
}

export function ComparisonBody({
  isLoading,
  errorMessage,
  activeTab,
  userFlaggedLines,
  userComments,
  solution,
  codeSnippet,
  files,
  gradeReport,
  language,
  onRetry,
  onTabChange,
}: ComparisonBodyProps) {
  if (isLoading) {
    return (
      <div
        data-testid="comparison-loading-state"
        className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center"
      >
        <RefreshCw
          aria-hidden="true"
          className="size-5 animate-spin text-muted-foreground"
        />
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
        <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
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
          <RefreshCw aria-hidden="true" className="size-3" />
          <span>Try Again</span>
        </Button>
      </div>
    )
  }

  if (activeTab === "diff") {
    return (
      <CodeDiffViewer
        rawDiff={solution?.recommended_fix_diff}
        language={language}
      />
    )
  }

  if (activeTab === "annotated") {
    return (
      <AnnotatedCodeTab
        codeSnippet={codeSnippet}
        files={files}
        language={language}
        gradeReport={gradeReport}
        solution={solution}
      />
    )
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
