"use client"

import * as React from "react"
import { Highlight, type PrismTheme } from "prism-react-renderer"
import type { ParsedDiffLine } from "@/components/review/comparison/diff-parser"
import { Prism } from "@/lib/prism-languages"
import { cn } from "@/lib/utils"
import {
  GutterFlagButton,
  LineNumberButton,
  LineTokens,
} from "./diff-flag-controls"

export interface UnifiedDiffViewProps {
  diffLines: ParsedDiffLine[]
  normalizedLanguage: string
  theme: PrismTheme
  flaggedLineNumbers: Set<number>
  onToggleLineNumber: (lineNumber: number) => void
  readOnly: boolean
}

export function UnifiedDiffView({
  diffLines,
  normalizedLanguage,
  theme,
  flaggedLineNumbers,
  onToggleLineNumber,
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

  return (
    <div data-testid="code-viewer-unified" className="overflow-x-auto p-1">
      <Highlight
        prism={Prism}
        theme={theme}
        code={joinedCode}
        language={normalizedLanguage}
      >
        {({ tokens, getTokenProps }) => (
          <table className="w-full border-collapse font-mono text-xs leading-5">
            <tbody>
              {visibleLines.map((line, idx) => {
                if (line.type === "hunk") {
                  return (
                    <tr
                      key={line.id}
                      data-testid="diff-hunk-header"
                      className="bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    >
                      <td
                        colSpan={5}
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
                const isFlagged =
                  targetLine !== undefined && flaggedLineNumbers.has(targetLine)
                const marker =
                  line.type === "added"
                    ? "+"
                    : line.type === "deleted"
                      ? "-"
                      : " "

                return (
                  <tr
                    key={line.id}
                    data-diff-type={line.type}
                    className={cn(
                      "group transition-colors",
                      isFlagged
                        ? "bg-amber-500/15 dark:bg-amber-500/20"
                        : line.type === "added"
                          ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                          : line.type === "deleted"
                            ? "bg-rose-500/10 hover:bg-rose-500/15"
                            : "hover:bg-muted/50"
                    )}
                  >
                    <td className="w-10 px-1.5 py-0.5 text-right align-top select-none">
                      {line.type === "deleted" && targetLine !== undefined ? (
                        <LineNumberButton
                          lineNumber={targetLine}
                          isFlagged={isFlagged}
                          readOnly={readOnly}
                          onToggle={onToggleLineNumber}
                        />
                      ) : (
                        <span className="inline-block w-8 pr-1 text-muted-foreground/60 tabular-nums">
                          {line.oldLineNumber ?? ""}
                        </span>
                      )}
                    </td>

                    <td className="w-10 px-1.5 py-0.5 text-right align-top select-none">
                      {line.type !== "deleted" && targetLine !== undefined ? (
                        <LineNumberButton
                          lineNumber={targetLine}
                          isFlagged={isFlagged}
                          readOnly={readOnly}
                          onToggle={onToggleLineNumber}
                        />
                      ) : (
                        <span className="inline-block w-8" />
                      )}
                    </td>

                    <td className="w-8 px-1 py-0.5 text-center align-top select-none">
                      {targetLine !== undefined ? (
                        <GutterFlagButton
                          lineNumber={targetLine}
                          isFlagged={isFlagged}
                          readOnly={readOnly}
                          onToggle={onToggleLineNumber}
                        />
                      ) : (
                        <span className="block w-3" />
                      )}
                    </td>

                    <td
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

                    <td className="px-2 py-0.5 align-top font-mono text-xs leading-5 whitespace-pre text-foreground">
                      <LineTokens
                        lineTokens={tokens[idx]}
                        getTokenProps={getTokenProps}
                        keyPrefix={`${line.id}-tok`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Highlight>
    </div>
  )
}
