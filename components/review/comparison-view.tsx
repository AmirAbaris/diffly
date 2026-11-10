"use client"

import * as React from "react"
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  Columns2,
  Copy,
  FileCode2,
  Flag,
  GitCompare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react"
import useSWR from "swr"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { ChallengeSolutionResponse } from "@/types/challenge"

export interface ComparisonViewProps {
  challengeId?: string | number
  challengeSlug?: string
  userFlaggedLines?: number[]
  userComments?: string
  canonicalSolution?: ChallengeSolutionResponse | null
  codeSnippet?: string
  language?: string
  className?: string
  defaultView?: "comparison" | "diff"
  onViewChange?: (view: "comparison" | "diff") => void
}

interface ParsedDiffLine {
  id: string
  type: "header" | "hunk" | "context" | "added" | "deleted"
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

interface SplitDiffRow {
  id: string
  type: "hunk" | "change" | "context"
  hunkHeader?: string
  left?: {
    lineNumber?: number
    content: string
    type: "deleted" | "context"
  }
  right?: {
    lineNumber?: number
    content: string
    type: "added" | "context"
  }
}

const DEFAULT_FLAGGED_LINES: number[] = []

/**
 * Parses a standard unified git diff into structured lines with line numbering.
 */
function parseUnifiedDiff(rawDiff: string): ParsedDiffLine[] {
  if (!rawDiff) return []

  const lines = rawDiff.split("\n")
  const parsed: ParsedDiffLine[] = []

  let oldCounter = 0
  let newCounter = 0

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const lineId = `diff-line-${idx + 1}`

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      parsed.push({ id: lineId, type: "header", content: line })
      continue
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      oldCounter = parseInt(hunkMatch[1], 10)
      newCounter = parseInt(hunkMatch[2], 10)
      parsed.push({ id: lineId, type: "hunk", content: line })
      continue
    }

    if (line.startsWith("-")) {
      parsed.push({
        id: lineId,
        type: "deleted",
        content: line.slice(1),
        oldLineNumber: oldCounter++,
      })
      continue
    }

    if (line.startsWith("+")) {
      parsed.push({
        id: lineId,
        type: "added",
        content: line.slice(1),
        newLineNumber: newCounter++,
      })
      continue
    }

    if (line.startsWith(" ") || line === "") {
      const content = line.startsWith(" ") ? line.slice(1) : line
      parsed.push({
        id: lineId,
        type: "context",
        content,
        oldLineNumber: oldCounter++,
        newLineNumber: newCounter++,
      })
      continue
    }

    parsed.push({ id: lineId, type: "header", content: line })
  }

  return parsed
}

/**
 * Converts unified diff lines into aligned rows for side-by-side (Before vs After) display.
 */
function buildSplitDiffRows(diffLines: ParsedDiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []
  let rowId = 0

  let i = 0
  while (i < diffLines.length) {
    const current = diffLines[i]

    if (current.type === "header") {
      i++
      continue
    }

    if (current.type === "hunk") {
      rowId++
      rows.push({
        id: `hunk-${rowId}`,
        type: "hunk",
        hunkHeader: current.content,
      })
      i++
      continue
    }

    if (current.type === "context") {
      rowId++
      rows.push({
        id: `ctx-${rowId}`,
        type: "context",
        left: {
          lineNumber: current.oldLineNumber,
          content: current.content,
          type: "context",
        },
        right: {
          lineNumber: current.newLineNumber,
          content: current.content,
          type: "context",
        },
      })
      i++
      continue
    }

    const deletions: ParsedDiffLine[] = []
    const additions: ParsedDiffLine[] = []

    while (
      i < diffLines.length &&
      (diffLines[i].type === "deleted" || diffLines[i].type === "added")
    ) {
      if (diffLines[i].type === "deleted") {
        deletions.push(diffLines[i])
      } else {
        additions.push(diffLines[i])
      }
      i++
    }

    const maxCount = Math.max(deletions.length, additions.length)
    for (let k = 0; k < maxCount; k++) {
      rowId++
      const del = deletions[k]
      const add = additions[k]

      rows.push({
        id: `change-${rowId}`,
        type: "change",
        left: del
          ? {
              lineNumber: del.oldLineNumber,
              content: del.content,
              type: "deleted",
            }
          : undefined,
        right: add
          ? {
              lineNumber: add.newLineNumber,
              content: add.content,
              type: "added",
            }
          : undefined,
      })
    }
  }

  return rows
}

function getSeverityBadgeStyle(severity?: string) {
  const s = (severity || "").toLowerCase().trim()
  if (s === "critical") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
  }
  if (s === "high") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400"
  }
  if (s === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
}

interface UserReviewColumnProps {
  flaggedLines: number[]
  comments: string
}

function UserReviewColumn({ flaggedLines, comments }: UserReviewColumnProps) {
  return (
    <section
      data-testid="user-review-column"
      aria-label="Your Review"
      className="flex flex-col gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4.5 sm:p-5 dark:bg-sky-950/[0.12]"
    >
      <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <User className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Your Review</h4>
            <span className="text-[11px] text-muted-foreground">
              Candidate Submission
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-sky-500/30 bg-sky-500/10 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
        >
          Your Critique
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Flag className="size-3.5 text-sky-500" />
            <span>Flagged Lines</span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {flaggedLines.length} {flaggedLines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        {flaggedLines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {flaggedLines
              .slice()
              .sort((a, b) => a - b)
              .map((line) => (
                <span
                  key={line}
                  data-testid={`user-flagged-line-${line}`}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-700 dark:text-sky-300"
                >
                  Line {line}
                </span>
              ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-xs text-muted-foreground">
            No specific code lines were flagged in this submission.
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <span className="text-xs font-semibold text-foreground">
          Your Written Comments
        </span>
        <div
          data-testid="user-review-comments"
          className="min-h-[140px] flex-1 rounded-xl border border-border/80 bg-background/90 p-3.5 text-xs leading-relaxed text-foreground"
        >
          {comments.trim() ? (
            <div className="font-sans whitespace-pre-wrap">{comments}</div>
          ) : (
            <span className="text-muted-foreground italic">
              No written critique comments provided.
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-sky-700 dark:text-sky-300">
          Review Phrasing Note:
        </strong>{" "}
        Notice how senior staff comments clearly state the
        security/architectural impact, identify the root cause, and provide a
        concrete fix blueprint.
      </div>
    </section>
  )
}

interface StaffReviewColumnProps {
  solution: ChallengeSolutionResponse | null
  onOpenDiff: () => void
}

function StaffReviewColumn({ solution, onOpenDiff }: StaffReviewColumnProps) {
  const issues = solution?.expected_issues ?? []

  return (
    <section
      data-testid="staff-review-column"
      aria-label="Staff Reviewer Critique"
      className="flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.03] p-4.5 sm:p-5 dark:bg-emerald-950/[0.12]"
    >
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Award className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Staff Reviewer Critique
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Senior Staff Engineer
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          Canonical Solution
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-foreground">
          Canonical Review Comment
        </span>
        <div
          data-testid="staff-canonical-review"
          className="rounded-xl border border-border/80 bg-background/90 p-3.5 text-xs leading-relaxed text-foreground"
        >
          {solution?.canonical_review ? (
            <MarkdownPreview content={solution.canonical_review} />
          ) : (
            <span className="text-muted-foreground italic">
              No canonical review critique available for this challenge.
            </span>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldAlert className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Defect Classification & Root Causes</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {issues.length} {issues.length === 1 ? "defect" : "defects"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                data-testid={`defect-item-${issue.id}`}
                className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-background/80 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-semibold text-foreground">
                    {issue.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {issue.lines && issue.lines.length > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Lines: {issue.lines.join(", ")}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold uppercase",
                        getSeverityBadgeStyle(issue.severity)
                      )}
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                </div>

                {issue.explanation && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {issue.explanation}
                  </p>
                )}

                {issue.keywords && issue.keywords.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {issue.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="py-0.2 rounded bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {solution?.recommended_fix_diff && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Recommended Code Diff
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenDiff}
              className="h-6 gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              data-testid="switch-to-diff-btn"
            >
              <span>Full Diff View</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>

          <pre className="max-h-[140px] overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
            <code>{solution.recommended_fix_diff.slice(0, 300)}...</code>
          </pre>
        </div>
      )}
    </section>
  )
}

interface CodeDiffViewerProps {
  rawDiff?: string
}

function CodeDiffViewer({ rawDiff = "" }: CodeDiffViewerProps) {
  const [diffMode, setDiffMode] = React.useState<"split" | "unified">("split")
  const [copied, setCopied] = React.useState(false)

  const diffLines = React.useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff])
  const splitRows = React.useMemo(
    () => buildSplitDiffRows(diffLines),
    [diffLines]
  )

  const handleCopy = React.useCallback(async () => {
    if (!rawDiff) return
    try {
      await navigator.clipboard.writeText(rawDiff)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Graceful clipboard fallback
    }
  }, [rawDiff])

  if (!rawDiff) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No code diff available for this challenge.
      </div>
    )
  }

  return (
    <div
      data-testid="code-diff-viewer"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-4 text-primary" />
          <span className="text-xs font-bold text-foreground">
            Canonical Code Fix Diff
          </span>
          <Badge variant="outline" className="text-[10px]">
            Before vs After Fix
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setDiffMode("split")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                diffMode === "split"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="diff-mode-split"
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setDiffMode("unified")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                diffMode === "unified"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="diff-mode-unified"
            >
              Unified
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1 text-[11px]"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy Diff</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {diffMode === "split" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-zinc-950 font-mono text-[11px]">
          <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-900/90 text-xs font-semibold">
            <div className="border-r border-zinc-800 px-4 py-2 text-rose-400">
              Before Fix (Original Defect)
            </div>
            <div className="px-4 py-2 text-emerald-400">
              After Fix (Recommended Solution)
            </div>
          </div>

          <div className="divide-y divide-zinc-900/60 leading-relaxed">
            {splitRows.map((row) => {
              if (row.type === "hunk") {
                return (
                  <div
                    key={row.id}
                    className="col-span-2 bg-sky-950/40 px-3 py-1 font-mono text-[11px] text-sky-400"
                  >
                    {row.hunkHeader}
                  </div>
                )
              }

              return (
                <div key={row.id} className="grid grid-cols-2">
                  <div
                    className={cn(
                      "flex min-h-[22px] items-start border-r border-zinc-800/80 px-2.5 py-0.5",
                      row.left?.type === "deleted"
                        ? "bg-rose-950/40 text-rose-200"
                        : "text-zinc-300"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-[10px] text-zinc-500 select-none">
                      {row.left?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-rose-400 select-none">
                      {row.left?.type === "deleted" ? "-" : " "}
                    </span>
                    <span className="overflow-x-auto whitespace-pre">
                      {row.left?.content ?? ""}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "flex min-h-[22px] items-start px-2.5 py-0.5",
                      row.right?.type === "added"
                        ? "bg-emerald-950/40 text-emerald-200"
                        : "text-zinc-300"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-[10px] text-zinc-500 select-none">
                      {row.right?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-emerald-400 select-none">
                      {row.right?.type === "added" ? "+" : " "}
                    </span>
                    <span className="overflow-x-auto whitespace-pre">
                      {row.right?.content ?? ""}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed">
          {diffLines.map((line) => {
            if (line.type === "hunk") {
              return (
                <div
                  key={line.id}
                  className="bg-sky-950/40 px-2 py-0.5 text-sky-400"
                >
                  {line.content}
                </div>
              )
            }
            if (line.type === "header") {
              return (
                <div key={line.id} className="text-zinc-500">
                  {line.content}
                </div>
              )
            }
            if (line.type === "deleted") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-rose-950/40 text-rose-200"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {line.oldLineNumber}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {" "}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-rose-400 select-none">
                    -
                  </span>
                  <span className="whitespace-pre">{line.content}</span>
                </div>
              )
            }
            if (line.type === "added") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-emerald-950/40 text-emerald-200"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {" "}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {line.newLineNumber}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-emerald-400 select-none">
                    +
                  </span>
                  <span className="whitespace-pre">{line.content}</span>
                </div>
              )
            }
            return (
              <div key={line.id} className="flex items-start text-zinc-300">
                <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                  {line.oldLineNumber}
                </span>
                <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                  {line.newLineNumber}
                </span>
                <span className="w-4 shrink-0 select-none"> </span>
                <span className="whitespace-pre">{line.content}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ComparisonBodyProps {
  isLoading: boolean
  errorMessage: string | null
  activeTab: "comparison" | "diff"
  userFlaggedLines: number[]
  userComments: string
  solution: ChallengeSolutionResponse | null
  onRetry: () => void
  onTabChange: (tab: "comparison" | "diff") => void
}

function ComparisonBody({
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
        className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
      >
        <RefreshCw className="size-5 animate-spin text-primary" />
        <p className="text-xs font-medium text-muted-foreground">
          Loading canonical review and expert fix...
        </p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        data-testid="comparison-error-state"
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle className="size-6 text-destructive" />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-destructive">
            Could not load canonical solution
          </span>
          <p className="text-[11px] text-muted-foreground">{errorMessage}</p>
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

export function ComparisonView({
  challengeId,
  challengeSlug,
  userFlaggedLines = DEFAULT_FLAGGED_LINES,
  userComments = "",
  canonicalSolution: propSolution,
  className,
  defaultView = "comparison",
  onViewChange,
}: ComparisonViewProps) {
  const [activeTab, setActiveTab] = React.useState<"comparison" | "diff">(
    defaultView
  )

  const targetIdentifier = challengeId ?? challengeSlug
  const swrKey =
    !propSolution && targetIdentifier
      ? `/api/challenges/${targetIdentifier}/solution?reveal=true`
      : null

  const {
    data: fetchedSolution,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<ChallengeSolutionResponse>(swrKey)

  const solution = propSolution ?? fetchedSolution ?? null

  const errorMessage = fetchError
    ? (fetchError as { response?: { data?: { detail?: string } } })?.response
        ?.data?.detail ||
      (fetchError instanceof Error
        ? fetchError.message
        : "Failed to load canonical solution")
    : null

  const handleTabChange = React.useCallback(
    (tab: "comparison" | "diff") => {
      setActiveTab(tab)
      onViewChange?.(tab)
    },
    [onViewChange]
  )

  const handleRetry = React.useCallback(() => {
    void mutate()
  }, [mutate])

  return (
    <div
      data-testid="comparison-view"
      className={cn(
        "flex w-full flex-col gap-5 rounded-2xl border border-border/80 bg-card p-4 text-foreground shadow-sm sm:p-6",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Side-by-Side Review Comparison
            </h3>
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary"
            >
              Staff Benchmark
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Compare your code critique against the senior staff benchmark and
            examine the canonical fix diff.
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => handleTabChange(val as "comparison" | "diff")}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger
              value="comparison"
              data-testid="toggle-comment-view"
              className="gap-1.5 text-xs"
            >
              <Columns2 className="size-3.5" />
              <span>Critique Comparison</span>
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              data-testid="toggle-diff-view"
              className="gap-1.5 text-xs"
            >
              <GitCompare className="size-3.5" />
              <span>Fix Diff</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ComparisonBody
        isLoading={isLoading}
        errorMessage={errorMessage}
        activeTab={activeTab}
        userFlaggedLines={userFlaggedLines}
        userComments={userComments}
        solution={solution}
        onRetry={handleRetry}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
