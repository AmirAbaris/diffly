"use client"

import * as React from "react"
import {
  Highlight,
  type PrismTheme,
  type RenderProps,
} from "prism-react-renderer"
import {
  buildSplitDiffRows,
  type ParsedDiffLine,
  type SplitDiffRow,
} from "@/components/review/comparison/diff-parser"
import { Prism } from "@/lib/prism-languages"
import { cn } from "@/lib/utils"
import {
  GutterFlagButton,
  LineNumberButton,
  LineTokens,
} from "./diff-flag-controls"

export interface SplitDiffViewProps {
  diffLines: ParsedDiffLine[]
  normalizedLanguage: string
  theme: PrismTheme
  flaggedLineNumbers: Set<number>
  onToggleLineNumber: (lineNumber: number) => void
  readOnly: boolean
}

const CELL_BG_MAP: Record<"added" | "deleted" | "context", string> = {
  added: "bg-emerald-500/10",
  deleted: "bg-rose-500/10",
  context: "group-hover:bg-muted/40",
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

interface SplitPaneCellsProps {
  side: "left" | "right"
  lineType: "added" | "deleted" | "context"
  displayLineNumber?: number
  targetLineNumber?: number
  isFlagged: boolean
  readOnly: boolean
  onToggleLineNumber: (lineNumber: number) => void
  tokens: RenderProps["tokens"][number] | undefined
  getTokenProps: RenderProps["getTokenProps"]
  keyPrefix: string
}

function SplitPaneCells({
  side,
  lineType,
  displayLineNumber,
  targetLineNumber,
  isFlagged,
  readOnly,
  onToggleLineNumber,
  tokens,
  getTokenProps,
  keyPrefix,
}: SplitPaneCellsProps) {
  const bgClass = isFlagged
    ? "bg-amber-500/15 dark:bg-amber-500/20"
    : CELL_BG_MAP[lineType]
  const ariaLabelSuffix = side === "left" ? " (original)" : ""

  return (
    <>
      <td
        className={cn(
          "w-10 px-1 py-0.5 text-right align-top select-none",
          bgClass
        )}
      >
        {targetLineNumber !== undefined ? (
          <LineNumberButton
            lineNumber={displayLineNumber ?? targetLineNumber}
            isFlagged={isFlagged}
            readOnly={readOnly}
            onToggle={() => onToggleLineNumber(targetLineNumber)}
          />
        ) : (
          <span className="inline-block w-8" />
        )}
      </td>
      <td
        className={cn(
          "w-7 px-0.5 py-0.5 text-center align-top select-none",
          bgClass
        )}
      >
        {targetLineNumber !== undefined && (
          <GutterFlagButton
            lineNumber={targetLineNumber}
            isFlagged={isFlagged}
            readOnly={readOnly}
            onToggle={onToggleLineNumber}
            ariaLabelSuffix={ariaLabelSuffix}
          />
        )}
      </td>
      <td
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

function SplitDiffRowItem({
  row,
  flaggedLineNumbers,
  newLineNumbersInPatch,
  readOnly,
  onToggleLineNumber,
  leftTokens,
  getLeftTokenProps,
  rightTokens,
  getRightTokenProps,
}: {
  row: SplitDiffRow
  flaggedLineNumbers: Set<number>
  newLineNumbersInPatch: Set<number>
  readOnly: boolean
  onToggleLineNumber: (lineNumber: number) => void
  leftTokens: RenderProps["tokens"][number] | undefined
  getLeftTokenProps: RenderProps["getTokenProps"]
  rightTokens: RenderProps["tokens"][number] | undefined
  getRightTokenProps: RenderProps["getTokenProps"]
}) {
  if (row.type === "hunk") {
    return (
      <tr
        data-testid="diff-hunk-header"
        className="bg-sky-500/10 text-sky-700 dark:text-sky-300"
      >
        <td
          colSpan={8}
          className="border-y border-border/60 px-3 py-1 font-mono text-xs"
        >
          {row.hunkHeader}
        </td>
      </tr>
    )
  }

  const leftTarget =
    row.left?.type === "deleted" &&
    row.left.lineNumber !== undefined &&
    !newLineNumbersInPatch.has(row.left.lineNumber)
      ? row.left.lineNumber
      : undefined
  const rightTarget = row.right?.lineNumber

  return (
    <tr className="group">
      {row.left ? (
        <SplitPaneCells
          side="left"
          lineType={row.left.type}
          displayLineNumber={row.left.lineNumber}
          targetLineNumber={leftTarget}
          isFlagged={
            leftTarget !== undefined && flaggedLineNumbers.has(leftTarget)
          }
          readOnly={readOnly}
          onToggleLineNumber={onToggleLineNumber}
          tokens={leftTokens}
          getTokenProps={getLeftTokenProps}
          keyPrefix={`${row.id}-left`}
        />
      ) : (
        <td
          colSpan={4}
          className="border-r border-border bg-muted/25 px-2 py-0.5"
        />
      )}

      {row.right ? (
        <SplitPaneCells
          side="right"
          lineType={row.right.type}
          displayLineNumber={row.right.lineNumber}
          targetLineNumber={rightTarget}
          isFlagged={
            rightTarget !== undefined && flaggedLineNumbers.has(rightTarget)
          }
          readOnly={readOnly}
          onToggleLineNumber={onToggleLineNumber}
          tokens={rightTokens}
          getTokenProps={getRightTokenProps}
          keyPrefix={`${row.id}-right`}
        />
      ) : (
        <td colSpan={4} className="bg-muted/25 px-2 py-0.5" />
      )}
    </tr>
  )
}

export function SplitDiffView({
  diffLines,
  normalizedLanguage,
  theme,
  flaggedLineNumbers,
  onToggleLineNumber,
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

  return (
    <div data-testid="code-viewer-split" className="overflow-x-auto p-1">
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
              <table className="w-full min-w-[640px] table-fixed border-collapse font-mono text-xs leading-5">
                <colgroup>
                  <col style={{ width: "2.5rem" }} />
                  <col style={{ width: "1.75rem" }} />
                  <col style={{ width: "1.25rem" }} />
                  <col style={{ width: "calc(50% - 5.5rem)" }} />
                  <col style={{ width: "2.5rem" }} />
                  <col style={{ width: "1.75rem" }} />
                  <col style={{ width: "1.25rem" }} />
                  <col style={{ width: "calc(50% - 5.5rem)" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left font-sans text-[11px] font-semibold">
                    <th
                      colSpan={4}
                      className="border-r border-border px-3 py-1.5 text-rose-600 dark:text-rose-400"
                    >
                      Original
                    </th>
                    <th
                      colSpan={4}
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
                      flaggedLineNumbers={flaggedLineNumbers}
                      newLineNumbersInPatch={newLineNumbersInPatch}
                      readOnly={readOnly}
                      onToggleLineNumber={onToggleLineNumber}
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
