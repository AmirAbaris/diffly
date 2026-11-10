"use client"

import * as React from "react"
import { Check, Copy, FileCode, Flag } from "lucide-react"
import { Highlight, themes, type RenderProps } from "prism-react-renderer"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface CodeViewerProps {
  code: string
  language?: "python" | "typescript" | string
  flaggedLines: number[]
  onToggleLine: (line: number) => void
  fileName?: string
  className?: string
  readOnly?: boolean
}

const emptySubscribe = () => () => {}

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

interface HighlightedLine {
  id: string
  lineNumber: number
  lineTokens: RenderProps["tokens"][number]
  tokenItems: Array<{
    id: string
    token: RenderProps["tokens"][number][number]
  }>
}

export function CodeViewer({
  code,
  language = "python",
  flaggedLines,
  onToggleLine,
  fileName,
  className,
  readOnly = false,
}: CodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  const [copied, setCopied] = React.useState(false)

  // Normalize language for Prism highlighting
  const normalizedLanguage = React.useMemo(() => {
    const lang = (language || "python").toLowerCase().trim()
    if (lang === "py" || lang === "python") return "python"
    if (lang === "ts" || lang === "typescript") return "typescript"
    if (lang === "js" || lang === "javascript") return "javascript"
    if (lang === "tsx") return "tsx"
    if (lang === "jsx") return "jsx"
    return "python"
  }, [language])

  const resolvedFileName =
    fileName ||
    (normalizedLanguage === "python" ? "solution.py" : "solution.ts")

  const flaggedSet = React.useMemo(() => new Set(flaggedLines), [flaggedLines])

  const handleCopy = React.useCallback(async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API is restricted
    }
  }, [code])

  const currentTheme =
    mounted && resolvedTheme === "light" ? themes.vsLight : themes.vsDark

  return (
    <div
      data-testid="code-viewer"
      className={cn(
        "flex flex-col rounded-lg border border-border bg-muted/20 font-mono text-xs",
        className
      )}
    >
      {/* File bar header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3">
        <div className="flex items-center gap-2">
          <FileCode className="size-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">
            {resolvedFileName}
          </span>
          <Badge variant="outline" size="sm" className="uppercase">
            {normalizedLanguage}
          </Badge>
          {code && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {code.split("\n").length} lines
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {flaggedLines.length > 0 && (
            <Badge variant="warning" size="sm" className="tabular-nums">
              {flaggedLines.length} flagged
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Code container with syntax highlighting and line flagging */}
      <div className="overflow-x-auto p-1">
        <Highlight
          theme={currentTheme}
          code={code || ""}
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
                    const isFlagged = flaggedSet.has(line.lineNumber)
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
                        {/* Line Number Button Cell */}
                        <td className="w-12 px-2 py-0.5 text-right align-top select-none">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              if (!readOnly) {
                                onToggleLine(line.lineNumber)
                              }
                            }}
                            title={
                              isFlagged
                                ? `Line ${line.lineNumber} flagged. Click to unflag.`
                                : "Click line to flag for review"
                            }
                            className={cn(
                              "inline-flex h-5 w-8 items-center justify-center rounded font-mono text-xs tabular-nums transition-colors",
                              readOnly && "cursor-default",
                              isFlagged
                                ? "bg-amber-500 font-bold text-amber-950"
                                : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {line.lineNumber}
                          </button>
                        </td>

                        {/* Marker badge indicator cell */}
                        <td className="w-10 px-1 py-0.5 text-center align-top select-none">
                          {isFlagged ? (
                            <span
                              title="Flagged for review"
                              className="inline-flex items-center justify-center rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 text-amber-700 dark:text-amber-400"
                            >
                              <Flag className="size-3 fill-amber-500 text-amber-500" />
                            </span>
                          ) : (
                            <span className="block w-3" />
                          )}
                        </td>

                        {/* Syntax Highlighted Code Cell */}
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
    </div>
  )
}
