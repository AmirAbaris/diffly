"use client"

import * as React from "react"
import type { PrismTheme } from "prism-react-renderer"
import { parseUnifiedDiff } from "@/components/review/comparison/diff-parser"
import { SplitDiffView } from "./split-diff-view"
import { UnifiedDiffView } from "./unified-diff-view"

export interface DiffHunkViewProps {
  patch: string
  filePath?: string | null
  normalizedLanguage: string
  theme: PrismTheme
  diffMode: "unified" | "split"
  readOnly?: boolean
}

export function DiffHunkView({
  patch,
  filePath = null,
  normalizedLanguage,
  theme,
  diffMode,
  readOnly = false,
}: DiffHunkViewProps) {
  const diffLines = React.useMemo(() => parseUnifiedDiff(patch), [patch])

  if (diffMode === "split") {
    return (
      <SplitDiffView
        diffLines={diffLines}
        filePath={filePath}
        normalizedLanguage={normalizedLanguage}
        theme={theme}
        readOnly={readOnly}
      />
    )
  }

  return (
    <UnifiedDiffView
      diffLines={diffLines}
      filePath={filePath}
      normalizedLanguage={normalizedLanguage}
      theme={theme}
      readOnly={readOnly}
    />
  )
}
