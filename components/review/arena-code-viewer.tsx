"use client"

import * as React from "react"
import { Check, Copy, FileCode, Flag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ArenaCodeViewerProps {
  code: string
  language?: string
  flaggedLines: number[]
  onToggleLine: (line: number) => void
}

interface CodeLine {
  id: string
  lineNumber: number
  lineContent: string
}

export function ArenaCodeViewer({
  code,
  language = "python",
  flaggedLines,
  onToggleLine,
}: ArenaCodeViewerProps) {
  const [copied, setCopied] = React.useState(false)

  const codeLines = React.useMemo<CodeLine[]>(() => {
    if (!code) return []
    return code.split("\n").map((lineContent, index) => {
      const lineNumber = index + 1
      return {
        id: `line-${lineNumber}`,
        lineNumber,
        lineContent,
      }
    })
  }, [code])

  const flaggedSet = React.useMemo(() => new Set(flaggedLines), [flaggedLines])

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API is restricted
    }
  }, [code])

  const fileName = language === "python" ? "solution.py" : "solution.ts"

  return (
    <div
      data-testid="arena-code-viewer"
      className="flex flex-col rounded-lg border border-border bg-muted/20 font-mono text-xs"
    >
      {/* File bar header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3">
        <div className="flex items-center gap-2">
          <FileCode className="size-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">{fileName}</span>
          <Badge variant="outline" className="text-[10px] uppercase">
            {language}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {codeLines.length} lines
          </span>
        </div>

        <div className="flex items-center gap-2">
          {flaggedLines.length > 0 && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400"
            >
              <Flag className="size-3" />
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

      {/* Code container */}
      <div className="overflow-x-auto p-1">
        <table className="w-full border-collapse">
          <tbody>
            {codeLines.map((line) => {
              const isFlagged = flaggedSet.has(line.lineNumber)

              return (
                <tr
                  key={line.id}
                  className={cn(
                    "group transition-colors",
                    isFlagged
                      ? "bg-amber-500/10 dark:bg-amber-500/15"
                      : "hover:bg-muted/50"
                  )}
                >
                  {/* Line Number Button */}
                  <td className="w-12 px-2 py-0.5 text-right align-top select-none">
                    <button
                      type="button"
                      onClick={() => onToggleLine(line.lineNumber)}
                      title={
                        isFlagged
                          ? `Line ${line.lineNumber} flagged. Click to unflag.`
                          : `Click to flag line ${line.lineNumber} for review`
                      }
                      className={cn(
                        "inline-flex h-5 w-8 items-center justify-center rounded font-mono text-[11px] transition-colors",
                        isFlagged
                          ? "bg-amber-500 font-bold text-amber-950"
                          : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {line.lineNumber}
                    </button>
                  </td>

                  {/* Flag indicator column */}
                  <td className="w-4 px-0.5 py-0.5 align-top select-none">
                    {isFlagged ? (
                      <Flag className="mt-1 size-3 fill-amber-500 text-amber-500" />
                    ) : (
                      <span className="block w-3" />
                    )}
                  </td>

                  {/* Code Line Content */}
                  <td className="px-2 py-0.5 align-top font-mono text-[12px] leading-5 whitespace-pre text-foreground">
                    {line.lineContent || " "}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
