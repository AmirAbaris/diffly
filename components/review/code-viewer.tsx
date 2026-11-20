"use client"

import * as React from "react"
import { Check, CircleHelp, Copy, FileCode, Flag } from "lucide-react"
import { Highlight, themes, type RenderProps } from "prism-react-renderer"
import { useTheme } from "next-themes"
import { CodeViewerSkeleton } from "@/components/review/code-viewer/code-viewer-skeleton"
import {
  normalizeCodeLanguage,
  resolveCodeFileName,
} from "@/components/review/code-viewer/language"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useClipboard } from "@/hooks/use-clipboard"
import { Prism } from "@/lib/prism-languages"
import { cn } from "@/lib/utils"
import type { Language } from "@/types/challenge"

export type CodeViewerProps =
  | {
      status: "loading"
      fileName?: string
      lineCountHint?: number
      className?: string
    }
  | {
      status?: "ready"
      code: string
      language?: Language | string
      flaggedLines: number[]
      onToggleLine: (line: number) => void
      onOpenGuide?: () => void
      fileName?: string
      className?: string
      readOnly?: boolean
    }

type ReadyCodeViewerProps = Extract<CodeViewerProps, { code: string }>

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

function ReadyCodeViewer({
  code,
  language = "python",
  flaggedLines,
  onToggleLine,
  onOpenGuide,
  fileName,
  className,
  readOnly = false,
}: ReadyCodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  const { copied, copy } = useClipboard()

  const normalizedLanguage = React.useMemo(
    () => normalizeCodeLanguage(language),
    [language]
  )
  const resolvedFileName = resolveCodeFileName(normalizedLanguage, fileName)
  const flaggedSet = React.useMemo(() => new Set(flaggedLines), [flaggedLines])

  const handleCopy = React.useCallback(() => {
    void copy(code)
  }, [code, copy])

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
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3">
        <div className="flex items-center gap-2">
          <FileCode
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
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
                <Check
                  aria-hidden="true"
                  className="size-3.5 text-emerald-500"
                />
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

      <div className="overflow-x-auto p-1">
        <Highlight
          prism={Prism}
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
                                  onToggleLine(line.lineNumber)
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
                              onClick={() => onToggleLine(line.lineNumber)}
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
    </div>
  )
}

export function CodeViewer(props: CodeViewerProps) {
  if (props.status === "loading") {
    return (
      <CodeViewerSkeleton
        fileName={props.fileName}
        lineCountHint={props.lineCountHint}
        className={props.className}
      />
    )
  }

  return <ReadyCodeViewer {...props} />
}
