import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const DEFAULT_LINE_COUNT = 16
const MIN_LINE_COUNT = 8
const MAX_LINE_COUNT = 24

const ROW_WIDTH_CLASSES = [
  "w-2/5",
  "w-3/4",
  "w-1/2",
  "w-5/6",
  "w-2/3",
  "w-3/5",
  "w-11/12",
  "w-1/3",
] as const

export interface CodeViewerSkeletonProps {
  fileName?: string
  /** Clamped between 8 and 24 rows so skeleton height matches real snippets. */
  lineCountHint?: number
  className?: string
}

function clampLineCount(lineCountHint?: number): number {
  if (
    typeof lineCountHint !== "number" ||
    !Number.isFinite(lineCountHint) ||
    lineCountHint <= 0
  ) {
    return DEFAULT_LINE_COUNT
  }
  return Math.min(
    MAX_LINE_COUNT,
    Math.max(MIN_LINE_COUNT, Math.round(lineCountHint))
  )
}

/**
 * Pure presentational skeleton safe in both RSC Suspense and CSR loading.
 */
export function CodeViewerSkeleton({
  fileName,
  lineCountHint,
  className,
}: CodeViewerSkeletonProps) {
  const rowCount = clampLineCount(lineCountHint)

  return (
    <div
      data-testid="code-viewer-loading"
      aria-busy="true"
      aria-label="Loading code viewer"
      className={cn(
        "flex flex-col rounded-lg border border-border bg-muted/20 font-mono text-xs",
        className
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded" />
          {fileName ? (
            <span className="font-semibold text-foreground">{fileName}</span>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-3.5 w-14" />
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      </div>

      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: rowCount }, (_, index) => {
          const widthClass = ROW_WIDTH_CLASSES[index % ROW_WIDTH_CLASSES.length]

          return (
            <div key={index} className="flex items-center gap-2 px-2 py-0.5">
              <div className="flex w-10 shrink-0 justify-end">
                <Skeleton className="h-3.5 w-5 rounded" />
              </div>
              <div className="w-8 shrink-0" />
              <Skeleton className={cn("h-3.5 rounded", widthClass)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
