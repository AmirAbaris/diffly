"use client"

import * as React from "react"
import type { PrismTheme } from "prism-react-renderer"
import { parseUnifiedDiff } from "@/components/review/comparison/diff-parser"
import { SplitDiffView } from "./split-diff-view"
import { UnifiedDiffView } from "./unified-diff-view"

export interface DiffHunkViewProps {
  patch: string
  normalizedLanguage: string
  theme: PrismTheme
  diffMode: "unified" | "split"
  flaggedLineNumbers: Set<number>
  onToggleLineNumber: (lineNumber: number) => void
  readOnly?: boolean
}

export function DiffHunkView({
  patch,
  normalizedLanguage,
  theme,
  diffMode,
  flaggedLineNumbers,
  onToggleLineNumber,
  readOnly = false,
}: DiffHunkViewProps) {
  const diffLines = React.useMemo(() => parseUnifiedDiff(patch), [patch])

  if (diffMode === "split") {
    return (
      <SplitDiffView
        diffLines={diffLines}
        normalizedLanguage={normalizedLanguage}
        theme={theme}
        flaggedLineNumbers={flaggedLineNumbers}
        onToggleLineNumber={onToggleLineNumber}
        readOnly={readOnly}
      />
    )
  }

  return (
    <UnifiedDiffView
      diffLines={diffLines}
      normalizedLanguage={normalizedLanguage}
      theme={theme}
      flaggedLineNumbers={flaggedLineNumbers}
      onToggleLineNumber={onToggleLineNumber}
      readOnly={readOnly}
    />
  )
}
