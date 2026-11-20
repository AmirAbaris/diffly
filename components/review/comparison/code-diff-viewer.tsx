"use client"

import * as React from "react"
import { Check, Copy, FileCode } from "lucide-react"
import { useTheme } from "next-themes"
import { themes } from "prism-react-renderer"
import { normalizeCodeLanguage } from "@/components/review/code-viewer/language"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useClipboard } from "@/hooks/use-clipboard"
import { cn } from "@/lib/utils"
import { CodeDiffSplitPane, CodeDiffUnifiedPane } from "./code-diff-panes"
import {
  buildSplitDiffRows,
  parseMultiFileUnifiedDiff,
  parseUnifiedDiff,
} from "./diff-parser"

export interface CodeDiffViewerProps {
  rawDiff?: string
  language?: string
}

export function CodeDiffViewer({
  rawDiff = "",
  language = "python",
}: CodeDiffViewerProps) {
  const [diffMode, setDiffMode] = React.useState<"split" | "unified">("split")
  const [selectedFileId, setSelectedFileId] = React.useState<string>("")
  const { copied, copy } = useClipboard()
  const { resolvedTheme } = useTheme()

  const normalizedLanguage = React.useMemo(
    () => normalizeCodeLanguage(language),
    [language]
  )
  const prismTheme = resolvedTheme === "light" ? themes.vsLight : themes.vsDark

  const parsedFiles = React.useMemo(
    () => parseMultiFileUnifiedDiff(rawDiff, normalizedLanguage),
    [rawDiff, normalizedLanguage]
  )
  const isMultiFile = parsedFiles.length > 1

  const activeFile = React.useMemo(() => {
    if (parsedFiles.length === 0) return null
    return parsedFiles.find((f) => f.id === selectedFileId) ?? parsedFiles[0]
  }, [parsedFiles, selectedFileId])

  const diffLines = React.useMemo(
    () => (activeFile ? activeFile.lines : parseUnifiedDiff(rawDiff)),
    [activeFile, rawDiff]
  )
  const splitRows = React.useMemo(
    () => buildSplitDiffRows(diffLines),
    [diffLines]
  )
  const activeLanguage = activeFile?.language ?? normalizedLanguage

  const handleCopy = React.useCallback(() => {
    void copy(rawDiff)
  }, [copy, rawDiff])

  if (!rawDiff) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No code diff available for this challenge.
      </div>
    )
  }

  return (
    <div data-testid="code-diff-viewer" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            Canonical Code Fix Diff
          </span>
          <Badge variant="outline" size="sm">
            Before vs After Fix
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant={diffMode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDiffMode("split")}
              className="h-8 px-2.5 text-xs"
              data-testid="diff-mode-split"
            >
              Side-by-Side
            </Button>
            <Button
              type="button"
              variant={diffMode === "unified" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDiffMode("unified")}
              className="h-8 px-2.5 text-xs"
              data-testid="diff-mode-unified"
            >
              Unified
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5 text-xs"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" className="size-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="size-3" />
                <span>Copy Diff</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {isMultiFile && activeFile && (
        <div
          role="tablist"
          aria-label="Fix diff files"
          data-testid="comparison-diff-file-tabs"
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1.5"
        >
          {parsedFiles.map((file) => {
            const isActive = file.id === activeFile.id
            return (
              <button
                key={file.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedFileId(file.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isActive
                    ? "border-border bg-background font-semibold text-foreground shadow-xs"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <FileCode aria-hidden="true" className="size-3 shrink-0" />
                <span>{file.filePath}</span>
                <span className="flex items-center gap-1 text-[11px] tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{file.additions}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">
                    -{file.deletions}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {diffMode === "split" ? (
        <CodeDiffSplitPane
          splitRows={splitRows}
          language={activeLanguage}
          theme={prismTheme}
        />
      ) : (
        <CodeDiffUnifiedPane
          diffLines={diffLines}
          language={activeLanguage}
          theme={prismTheme}
        />
      )}
    </div>
  )
}
