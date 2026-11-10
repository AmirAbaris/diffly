import * as React from "react"
import { Check, Copy, FileCode2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { buildSplitDiffRows, parseUnifiedDiff } from "./diff-parser"

export interface CodeDiffViewerProps {
  rawDiff?: string
}

export function CodeDiffViewer({ rawDiff = "" }: CodeDiffViewerProps) {
  const [diffMode, setDiffMode] = React.useState<"split" | "unified">("split")
  const [copied, setCopied] = React.useState(false)

  const diffLines = React.useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff])
  const splitRows = React.useMemo(
    () => buildSplitDiffRows(diffLines),
    [diffLines]
  )

  const handleCopy = React.useCallback(async () => {
    if (!rawDiff) return
    try {
      await navigator.clipboard.writeText(rawDiff)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Graceful clipboard fallback
    }
  }, [rawDiff])

  if (!rawDiff) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No code diff available for this challenge.
      </div>
    )
  }

  return (
    <div
      data-testid="code-diff-viewer"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-4 text-primary" />
          <span className="text-xs font-bold text-foreground">
            Canonical Code Fix Diff
          </span>
          <Badge variant="outline" className="text-[10px]">
            Before vs After Fix
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setDiffMode("split")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                diffMode === "split"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="diff-mode-split"
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setDiffMode("unified")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                diffMode === "unified"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="diff-mode-unified"
            >
              Unified
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1 text-[11px]"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy Diff</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {diffMode === "split" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-zinc-950 font-mono text-[11px]">
          <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-900/90 text-xs font-semibold">
            <div className="border-r border-zinc-800 px-4 py-2 text-rose-400">
              Before Fix (Original Defect)
            </div>
            <div className="px-4 py-2 text-emerald-400">
              After Fix (Recommended Solution)
            </div>
          </div>

          <div className="divide-y divide-zinc-900/60 leading-relaxed">
            {splitRows.map((row) => {
              if (row.type === "hunk") {
                return (
                  <div
                    key={row.id}
                    className="col-span-2 bg-sky-950/40 px-3 py-1 font-mono text-[11px] text-sky-400"
                  >
                    {row.hunkHeader}
                  </div>
                )
              }

              return (
                <div key={row.id} className="grid grid-cols-2">
                  <div
                    className={cn(
                      "flex min-h-[22px] items-start border-r border-zinc-800/80 px-2.5 py-0.5",
                      row.left?.type === "deleted"
                        ? "bg-rose-950/40 text-rose-200"
                        : "text-zinc-300"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-[10px] text-zinc-500 select-none">
                      {row.left?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-rose-400 select-none">
                      {row.left?.type === "deleted" ? "-" : " "}
                    </span>
                    <span className="overflow-x-auto whitespace-pre">
                      {row.left?.content ?? ""}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "flex min-h-[22px] items-start px-2.5 py-0.5",
                      row.right?.type === "added"
                        ? "bg-emerald-950/40 text-emerald-200"
                        : "text-zinc-300"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-[10px] text-zinc-500 select-none">
                      {row.right?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-emerald-400 select-none">
                      {row.right?.type === "added" ? "+" : " "}
                    </span>
                    <span className="overflow-x-auto whitespace-pre">
                      {row.right?.content ?? ""}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed">
          {diffLines.map((line) => {
            if (line.type === "hunk") {
              return (
                <div
                  key={line.id}
                  className="bg-sky-950/40 px-2 py-0.5 text-sky-400"
                >
                  {line.content}
                </div>
              )
            }
            if (line.type === "header") {
              return (
                <div key={line.id} className="text-zinc-500">
                  {line.content}
                </div>
              )
            }
            if (line.type === "deleted") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-rose-950/40 text-rose-200"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {line.oldLineNumber}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {" "}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-rose-400 select-none">
                    -
                  </span>
                  <span className="whitespace-pre">{line.content}</span>
                </div>
              )
            }
            if (line.type === "added") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-emerald-950/40 text-emerald-200"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {" "}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                    {line.newLineNumber}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-emerald-400 select-none">
                    +
                  </span>
                  <span className="whitespace-pre">{line.content}</span>
                </div>
              )
            }
            return (
              <div key={line.id} className="flex items-start text-zinc-300">
                <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                  {line.oldLineNumber}
                </span>
                <span className="w-8 shrink-0 pr-2 text-right text-[10px] text-zinc-600 select-none">
                  {line.newLineNumber}
                </span>
                <span className="w-4 shrink-0 select-none"> </span>
                <span className="whitespace-pre">{line.content}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
