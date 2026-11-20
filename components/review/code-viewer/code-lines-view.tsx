"use client"

import * as React from "react"
import { Flag } from "lucide-react"
import {
  Highlight,
  type PrismTheme,
  type RenderProps,
} from "prism-react-renderer"
import { Prism } from "@/lib/prism-languages"
import { cn } from "@/lib/utils"

interface HighlightedLine {
  id: string
  lineNumber: number
  lineTokens: RenderProps["tokens"][number]
  tokenItems: Array<{
    id: string
    token: RenderProps["tokens"][number][number]
  }>
}

export interface CodeLinesViewProps {
  code: string
  normalizedLanguage: string
  theme: PrismTheme
  flaggedLineNumbers: Set<number>
  onToggleLineNumber: (lineNumber: number) => void
  readOnly?: boolean
}

export function CodeLinesView({
  code,
  normalizedLanguage,
  theme,
  flaggedLineNumbers,
  onToggleLineNumber,
  readOnly = false,
}: CodeLinesViewProps) {
  return (
    <div className="overflow-x-auto p-1">
      <Highlight
        prism={Prism}
        theme={theme}
        code={(code || "").replace(/\r?\n$/, "")}
        language={normalizedLanguage}
      >
        {({ tokens, getLineProps, getTokenProps }) => {
          const lines: HighlightedLine[] = tokens.map((lineTokens, i) => {
            const lineNumber = i + 1
            return {
              id: `diffly-line-${lineNumber}`,
              lineNumber,
              lineTokens,
              tokenItems: lineTokens.map((token, j) => ({
                id: `diffly-tok-${lineNumber}-${j}`,
                token,
              })),
            }
          })

          return (
            <table className="w-full border-collapse font-mono text-xs leading-5">
              <tbody>
                {lines.map((line) => {
                  const isFlagged = flaggedLineNumbers.has(line.lineNumber)
                  const lineProps = getLineProps({
                    line: line.lineTokens,
                  })
                  delete (lineProps as { key?: unknown }).key

                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        "group transition-colors",
                        isFlagged
                          ? "bg-amber-500/15 dark:bg-amber-500/20"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <td className="w-12 px-2 py-0.5 text-right align-top select-none">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            if (!readOnly) {
                              onToggleLineNumber(line.lineNumber)
                            }
                          }}
                          title={
                            isFlagged
                              ? `Line ${line.lineNumber} flagged. Click to unflag.`
                              : `Click to flag line ${line.lineNumber} for review`
                          }
                          className={cn(
                            "inline-flex h-5 w-8 items-center justify-center rounded font-mono text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            readOnly && "cursor-default",
                            isFlagged
                              ? "bg-amber-500 font-bold text-amber-950"
                              : "text-muted-foreground/60 group-hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {line.lineNumber}
                        </button>
                      </td>

                      <td className="w-10 px-1 py-0.5 text-center align-top select-none">
                        {isFlagged ? (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              if (!readOnly) {
                                onToggleLineNumber(line.lineNumber)
                              }
                            }}
                            title="Flagged for review"
                            aria-label={`Unflag line ${line.lineNumber}`}
                            className="inline-flex items-center justify-center rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 text-amber-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-400"
                          >
                            <Flag
                              aria-hidden="true"
                              className="size-3 fill-amber-500 text-amber-500"
                            />
                          </button>
                        ) : !readOnly ? (
                          <button
                            type="button"
                            onClick={() => onToggleLineNumber(line.lineNumber)}
                            title={`Click to flag line ${line.lineNumber}`}
                            aria-label={`Flag line ${line.lineNumber}`}
                            className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity duration-150 group-hover:opacity-70 hover:bg-muted hover:text-amber-500 hover:!opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <Flag aria-hidden="true" className="size-3" />
                          </button>
                        ) : (
                          <span className="block w-3" />
                        )}
                      </td>

                      <td
                        className={cn(
                          "px-2 py-0.5 align-top font-mono text-xs leading-5 whitespace-pre text-foreground",
                          lineProps.className
                        )}
                        style={lineProps.style}
                      >
                        {line.tokenItems.length === 0 ||
                        (line.tokenItems.length === 1 &&
                          line.tokenItems[0].token.content === "") ? (
                          <span>&#8203;</span>
                        ) : (
                          line.tokenItems.map((item) => {
                            const tokenProps = getTokenProps({
                              token: item.token,
                            })
                            delete (tokenProps as { key?: unknown }).key

                            return <span key={item.id} {...tokenProps} />
                          })
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        }}
      </Highlight>
    </div>
  )
}
