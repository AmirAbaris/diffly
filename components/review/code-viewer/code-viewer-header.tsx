"use client"

import * as React from "react"
import {
  Check,
  CircleHelp,
  Columns2,
  Copy,
  FileCode,
  Rows3,
} from "lucide-react"
import type { PrFileSummary } from "@/components/review/code-viewer/pr-file-tree"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export interface CodeViewerHeaderProps {
  fileName: string
  normalizedLanguage: string
  hasPatch: boolean
  activeFileStats: PrFileSummary | null
  codeLineCount: number
  diffMode: "unified" | "split"
  onDiffModeChange: (mode: "unified" | "split") => void
  flaggedCount: number
  copied: boolean
  onCopy: () => void
  onOpenGuide?: () => void
}

export function CodeViewerHeader({
  fileName,
  normalizedLanguage,
  hasPatch,
  activeFileStats,
  codeLineCount,
  diffMode,
  onDiffModeChange,
  flaggedCount,
  copied,
  onCopy,
  onOpenGuide,
}: CodeViewerHeaderProps) {
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <FileCode
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span
          title={fileName}
          className="truncate font-semibold text-foreground"
        >
          {fileName}
        </span>
        <Badge variant="outline" size="sm" className="uppercase">
          {normalizedLanguage}
        </Badge>
        {hasPatch && activeFileStats ? (
          <span className="flex items-center gap-1.5 text-xs tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{activeFileStats.additions}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              -{activeFileStats.deletions}
            </span>
          </span>
        ) : (
          codeLineCount > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {codeLineCount} lines
            </span>
          )
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasPatch && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={diffMode}
            onValueChange={(value) => {
              if (value === "unified" || value === "split") {
                onDiffModeChange(value)
              }
            }}
            aria-label="Diff display mode"
            className="font-sans"
          >
            <ToggleGroupItem
              value="unified"
              data-testid="code-diff-mode-unified"
              aria-label="Unified diff view"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Rows3 aria-hidden="true" className="size-3.5" />
              <span>Unified</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="split"
              data-testid="code-diff-mode-split"
              aria-label="Split diff view"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Columns2 aria-hidden="true" className="size-3.5" />
              <span>Split</span>
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {onOpenGuide && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenGuide}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="How to flag lines guide"
            aria-label="How to flag lines guide"
            data-testid="how-to-flag-guide-button"
          >
            <CircleHelp aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">How to flag</span>
          </Button>
        )}

        {flaggedCount > 0 && (
          <Badge variant="warning" size="sm" className="tabular-nums">
            {flaggedCount} flagged
          </Badge>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check aria-hidden="true" className="size-3.5 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy aria-hidden="true" className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
