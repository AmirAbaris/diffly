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
import {
  buildSplitDiffRows,
  type ParsedDiffLine,
  type SplitDiffRow,
} from "@/components/review/comparison/diff-parser"
import { Prism } from "@/lib/prism-languages"
import type { LineRef } from "@/lib/review"
import { cn } from "@/lib/utils"
import { LineTokens } from "./line-tokens"

export interface SplitDiffViewProps {
  diffLines: ParsedDiffLine[]
  filePath?: string | null
  normalizedLanguage: string
  theme: PrismTheme
  readOnly: boolean
}

const CELL_BG_MAP: Record<"added" | "deleted" | "context", string> = {
  added: "bg-emerald-500/10",
  deleted: "bg-rose-500/10",
  context: "group-hover:bg-muted/40",
}

const TONE_CELL_BG: Record<string, string> = {
  flagged: "bg-amber-500/15 dark:bg-amber-500/20",
  "verdict-hit": "bg-emerald-500/10",
  "verdict-miss": "bg-amber-500/10",
  "verdict-false": "bg-rose-500/10",
  muted: "bg-muted/40",
}

const MARKER_MAP: Record<"added" | "deleted" | "context", string> = {
  added: "+",
  deleted: "-",
  context: " ",
}

const MARKER_COLOR_MAP: Record<"added" | "deleted" | "context", string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  deleted: "text-rose-600 dark:text-rose-400",
  context: "text-muted-foreground/40",
}

function SplitPaneCells({
  side,
  lineType,
  at,
  displayLineNumber,
  readOnly,
  defaultTabStop,
  tokens,
  getTokenProps,
  keyPrefix,
}: {
  side: "left" | "right"
  lineType: "added" | "deleted" | "context"
  at: LineRef | null
  displayLineNumber?: number
  readOnly: boolean
  defaultTabStop: boolean
  tokens: RenderProps["tokens"][number] | undefined
  getTokenProps: RenderProps["getTokenProps"]
  keyPrefix: string
}) {
  const annotation = useRowAnnotation(at)
  const bgClass = TONE_CELL_BG[annotation.tone] ?? CELL_BG_MAP[lineType]
  const ariaLabelSuffix = side === "left" ? " (original)" : ""

  return (
    <>
      <td
        role="gridcell"
        className={cn(
          "w-12 px-1 py-0.5 text-right align-top select-none",
          bgClass
        )}
      >
        {at ? (
          <LineGutterCell
            at={at}
            displayLineNumber={displayLineNumber ?? at.line}
            ariaLabelSuffix={ariaLabelSuffix}
            readOnly={readOnly}
            defaultTabStop={defaultTabStop}
          />
        ) : (
          <span className="inline-block w-8 pr-1 text-muted-foreground/60 tabular-nums">
            {displayLineNumber ?? ""}
          </span>
        )}
      </td>
      <td
        role="gridcell"
        aria-hidden="true"
        className={cn(
          "w-4 px-0.5 py-0.5 text-center align-top font-bold select-none",
          bgClass,
          MARKER_COLOR_MAP[lineType]
        )}
      >
        {MARKER_MAP[lineType]}
      </td>
      <td
        role="gridcell"
        className={cn(
          "px-2 py-0.5 align-top font-mono text-xs leading-5 [overflow-wrap:break-word] whitespace-pre-wrap text-foreground",
          side === "left" && "border-r border-border",
          bgClass
        )}
      >
        <LineTokens
          lineTokens={tokens}
          getTokenProps={getTokenProps}
          keyPrefix={keyPrefix}
        />
      </td>
    </>
  )
}

const SplitDiffRowItem = React.memo(function SplitDiffRowItem({
  row,
  filePath,
  newLineNumbersInPatch,
  readOnly,
  isFirstSelectable,
  leftTokens,
  getLeftTokenProps,
  rightTokens,
  getRightTokenProps,
}: {
  row: SplitDiffRow
  filePath: string | null
  newLineNumbersInPatch: Set<number>
  readOnly: boolean
  isFirstSelectable: boolean
  leftTokens: RenderProps["tokens"][number] | undefined
  getLeftTokenProps: RenderProps["getTokenProps"]
  rightTokens: RenderProps["tokens"][number] | undefined
  getRightTokenProps: RenderProps["getTokenProps"]
}) {
  const leftTarget =
    row.left?.type === "deleted" &&
    row.left.lineNumber !== undefined &&
    !newLineNumbersInPatch.has(row.left.lineNumber)
      ? row.left.lineNumber
      : undefined
  const rightTarget = row.right?.lineNumber

  const leftAt = React.useMemo<LineRef | null>(
    () =>
      leftTarget !== undefined ? { file: filePath, line: leftTarget } : null,
    [filePath, leftTarget]
  )
  const rightAt = React.useMemo<LineRef | null>(
    () =>
      rightTarget !== undefined ? { file: filePath, line: rightTarget } : null,
    [filePath, rightTarget]
  )

  if (row.type === "hunk") {
    return (
      <tr
        role="row"
        data-testid="diff-hunk-header"
        className="bg-sky-500/10 text-sky-700 dark:text-sky-300"
      >
        <td
          role="gridcell"
          colSpan={6}
          className="border-y border-border/60 px-3 py-1 font-mono text-xs"
        >
          {row.hunkHeader}
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr role="row" className="group">
        {row.left ? (
          <SplitPaneCells
            side="left"
            lineType={row.left.type}
            at={leftAt}
            displayLineNumber={row.left.lineNumber}
            readOnly={readOnly}
            defaultTabStop={isFirstSelectable && !rightAt && Boolean(leftAt)}
            tokens={leftTokens}
            getTokenProps={getLeftTokenProps}
            keyPrefix={`${row.id}-left`}
          />
        ) : (
          <td
            role="gridcell"
            colSpan={3}
            className="border-r border-border bg-muted/25 px-2 py-0.5"
          />
        )}

        {row.right ? (
          <SplitPaneCells
            side="right"
            lineType={row.right.type}
            at={rightAt}
            displayLineNumber={row.right.lineNumber}
            readOnly={readOnly}
            defaultTabStop={isFirstSelectable && Boolean(rightAt)}
            tokens={rightTokens}
            getTokenProps={getRightTokenProps}
            keyPrefix={`${row.id}-right`}
          />
        ) : (
          <td role="gridcell" colSpan={3} className="bg-muted/25 px-2 py-0.5" />
        )}
      </tr>
      <InlineThreadRow at={rightAt ?? leftAt} colSpan={6} />
    </>
  )
})

export function SplitDiffView({
  diffLines,
  filePath = null,
  normalizedLanguage,
  theme,
  readOnly,
}: SplitDiffViewProps) {
  const splitRows = React.useMemo(
    () => buildSplitDiffRows(diffLines),
    [diffLines]
  )
  const newLineNumbersInPatch = React.useMemo(() => {
    const set = new Set<number>()
    for (const line of diffLines) {
      if (
        line.type !== "deleted" &&
        line.type !== "header" &&
        line.type !== "hunk" &&
        line.newLineNumber !== undefined
      ) {
        set.add(line.newLineNumber)
      }
    }
    return set
  }, [diffLines])
  const leftCode = React.useMemo(
    () => splitRows.map((row) => row.left?.content ?? "").join("\n"),
    [splitRows]
  )
  const rightCode = React.useMemo(
    () => splitRows.map((row) => row.right?.content ?? "").join("\n"),
    [splitRows]
  )

  const firstSelectableIdx = React.useMemo(
    () =>
      splitRows.findIndex((row) => {
        if (row.type === "hunk") return false
        const leftTarget =
          row.left?.type === "deleted" &&
          row.left.lineNumber !== undefined &&
          !newLineNumbersInPatch.has(row.left.lineNumber)
        return Boolean(leftTarget || row.right?.lineNumber !== undefined)
      }),
    [splitRows, newLineNumbersInPatch]
  )

  return (
    <div
      data-testid="code-viewer-split"
      className="[container-type:inline-size] overflow-x-auto p-1"
    >
      <Highlight
        prism={Prism}
        theme={theme}
        code={leftCode}
        language={normalizedLanguage}
      >
        {(leftHighlight) => (
          <Highlight
            prism={Prism}
            theme={theme}
            code={rightCode}
            language={normalizedLanguage}
          >
            {(rightHighlight) => (
              <table
                role="grid"
                aria-label="Split diff"
                className="w-full min-w-[640px] table-fixed border-collapse font-mono text-xs leading-5"
              >
                <colgroup>
                  <col style={{ width: "4.25rem" }} />
                  <col style={{ width: "1.25rem" }} />
                  <col style={{ width: "calc(50% - 5.5rem)" }} />
                  <col style={{ width: "4.25rem" }} />
                  <col style={{ width: "1.25rem" }} />
                  <col style={{ width: "calc(50% - 5.5rem)" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left font-sans text-[11px] font-semibold">
                    <th
                      colSpan={3}
                      className="border-r border-border px-3 py-1.5 text-rose-600 dark:text-rose-400"
                    >
                      Original
                    </th>
                    <th
                      colSpan={3}
                      className="px-3 py-1.5 text-emerald-600 dark:text-emerald-400"
                    >
                      Modified
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {splitRows.map((row, idx) => (
                    <SplitDiffRowItem
                      key={row.id}
                      row={row}
                      filePath={filePath}
                      newLineNumbersInPatch={newLineNumbersInPatch}
                      readOnly={readOnly}
                      isFirstSelectable={idx === firstSelectableIdx}
                      leftTokens={leftHighlight.tokens[idx]}
                      getLeftTokenProps={leftHighlight.getTokenProps}
                      rightTokens={rightHighlight.tokens[idx]}
                      getRightTokenProps={rightHighlight.getTokenProps}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Highlight>
        )}
      </Highlight>
    </div>
  )
}
