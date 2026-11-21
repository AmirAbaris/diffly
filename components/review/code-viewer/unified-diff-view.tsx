"use client"

import * as React from "react"
import {
  Highlight,
  type PrismTheme,
  type RenderProps,
} from "prism-react-renderer"
import { InlineThreadRow } from "@/components/review/annotations/inline-thread-row"
import { LineGutterCell } from "@/components/review/annotations/line-gutter-cell"
import { useRowAnnotation } from "@/components/review/annotations/use-row-annotation"
import type { ParsedDiffLine } from "@/components/review/comparison/diff-parser"
import { Prism } from "@/lib/prism-languages"
import type { LineRef } from "@/lib/review"
import { cn } from "@/lib/utils"
import { LineTokens } from "./line-tokens"

export interface UnifiedDiffViewProps {
  diffLines: ParsedDiffLine[]
  filePath?: string | null
  normalizedLanguage: string
  theme: PrismTheme
  readOnly: boolean
}

const ROW_TONE_CLASSES: Record<string, string> = {
  flagged: "bg-amber-500/15 dark:bg-amber-500/20",
  "verdict-hit": "bg-emerald-500/10",
  "verdict-miss": "bg-amber-500/10",
  "verdict-false": "bg-rose-500/10",
  muted: "bg-muted/40",
}

const UnifiedDiffRow = React.memo(function UnifiedDiffRow({
  line,
  filePath,
  targetLine,
  readOnly,
  defaultTabStop,
  lineTokens,
  getTokenProps,
}: {
  line: ParsedDiffLine
  filePath: string | null
  targetLine: number | undefined
  readOnly: boolean
  defaultTabStop: boolean
  lineTokens: RenderProps["tokens"][number] | undefined
  getTokenProps: RenderProps["getTokenProps"]
}) {
  const at = React.useMemo<LineRef | null>(
    () =>
      targetLine !== undefined ? { file: filePath, line: targetLine } : null,
    [filePath, targetLine]
  )
  const annotation = useRowAnnotation(at)

  const defaultBg =
    line.type === "added"
      ? "bg-emerald-500/10 hover:bg-emerald-500/15"
      : line.type === "deleted"
        ? "bg-rose-500/10 hover:bg-rose-500/15"
        : "hover:bg-muted/50"

  const marker =
    line.type === "added" ? "+" : line.type === "deleted" ? "-" : " "

  return (
    <>
      <tr
        role="row"
        data-diff-type={line.type}
        className={cn(
          "group transition-colors",
          ROW_TONE_CLASSES[annotation.tone] ?? defaultBg
        )}
      >
        <td
          role="gridcell"
          className="w-16 px-1 py-0.5 text-right align-top select-none"
        >
          {line.type === "deleted" && at && targetLine !== undefined ? (
            <LineGutterCell
              at={at}
              displayLineNumber={targetLine}
              readOnly={readOnly}
              defaultTabStop={defaultTabStop}
            />
          ) : (
            <span className="inline-block w-8 pr-1 text-muted-foreground/60 tabular-nums">
              {line.oldLineNumber ?? ""}
            </span>
          )}
        </td>

        <td
          role="gridcell"
          className="w-16 px-1 py-0.5 text-right align-top select-none"
        >
          {line.type !== "deleted" && at && targetLine !== undefined ? (
            <LineGutterCell
              at={at}
              displayLineNumber={targetLine}
              readOnly={readOnly}
              defaultTabStop={defaultTabStop}
            />
          ) : (
            <span className="inline-block w-8" />
          )}
        </td>

        <td
          role="gridcell"
          aria-hidden="true"
          className={cn(
            "w-5 px-1 py-0.5 text-center align-top font-bold select-none",
            line.type === "added"
              ? "text-emerald-600 dark:text-emerald-400"
              : line.type === "deleted"
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground/50"
          )}
        >
          {marker}
        </td>

        <td
          role="gridcell"
          className="px-2 py-0.5 align-top font-mono text-xs leading-5 whitespace-pre text-foreground"
        >
          <LineTokens
            lineTokens={lineTokens}
            getTokenProps={getTokenProps}
            keyPrefix={`${line.id}-tok`}
          />
        </td>
      </tr>
      <InlineThreadRow at={at} colSpan={4} />
    </>
  )
})

export function UnifiedDiffView({
  diffLines,
  filePath = null,
  normalizedLanguage,
  theme,
  readOnly,
}: UnifiedDiffViewProps) {
  const visibleLines = React.useMemo(
    () => diffLines.filter((line) => line.type !== "header"),
    [diffLines]
  )
  const newLineNumbersInPatch = React.useMemo(() => {
    const set = new Set<number>()
    for (const line of visibleLines) {
      if (line.type !== "deleted" && line.newLineNumber !== undefined) {
        set.add(line.newLineNumber)
      }
    }
    return set
  }, [visibleLines])
  const joinedCode = React.useMemo(
    () => visibleLines.map((line) => line.content).join("\n"),
    [visibleLines]
  )

  const firstSelectableIdx = React.useMemo(
    () =>
      visibleLines.findIndex((line) => {
        if (line.type === "hunk") return false
        const target =
          line.type === "deleted"
            ? line.oldLineNumber !== undefined &&
              !newLineNumbersInPatch.has(line.oldLineNumber)
              ? line.oldLineNumber
              : undefined
            : (line.newLineNumber ?? line.oldLineNumber)
        return target !== undefined
      }),
    [visibleLines, newLineNumbersInPatch]
  )

  return (
    <div
      data-testid="code-viewer-unified"
      className="[container-type:inline-size] overflow-x-auto p-1"
    >
      <Highlight
        prism={Prism}
        theme={theme}
        code={joinedCode}
        language={normalizedLanguage}
      >
        {({ tokens, getTokenProps }) => (
          <table
            role="grid"
            aria-label="Unified diff"
            className="w-full border-collapse font-mono text-xs leading-5"
          >
            <tbody>
              {visibleLines.map((line, idx) => {
                if (line.type === "hunk") {
                  return (
                    <tr
                      key={line.id}
                      role="row"
                      data-testid="diff-hunk-header"
                      className="bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    >
                      <td
                        role="gridcell"
                        colSpan={4}
                        className="border-y border-border/60 px-3 py-1 font-mono text-xs"
                      >
                        {line.content}
                      </td>
                    </tr>
                  )
                }

                const targetLine =
                  line.type === "deleted"
                    ? line.oldLineNumber !== undefined &&
                      !newLineNumbersInPatch.has(line.oldLineNumber)
                      ? line.oldLineNumber
                      : undefined
                    : (line.newLineNumber ?? line.oldLineNumber)

                return (
                  <UnifiedDiffRow
                    key={line.id}
                    line={line}
                    filePath={filePath}
                    targetLine={targetLine}
                    readOnly={readOnly}
                    defaultTabStop={idx === firstSelectableIdx}
                    lineTokens={tokens[idx]}
                    getTokenProps={getTokenProps}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </Highlight>
    </div>
  )
}
