"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { useTheme } from "next-themes"
import { Highlight, themes, type PrismTheme } from "prism-react-renderer"
import { normalizeCodeLanguage } from "@/components/review/code-viewer/language"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useClipboard } from "@/hooks/use-clipboard"
import { Prism } from "@/lib/prism-languages"
import { keyByValue } from "@/lib/unique-keys"
import { cn } from "@/lib/utils"
import { buildSplitDiffRows, parseUnifiedDiff } from "./diff-parser"

export interface CodeDiffViewerProps {
  rawDiff?: string
  language?: string
}

function HighlightedDiffLine({
  code,
  language,
  theme,
}: {
  code: string
  language: string
  theme: PrismTheme
}) {
  if (!code) {
    return <span className="whitespace-pre"> </span>
  }

  return (
    <Highlight prism={Prism} theme={theme} code={code} language={language}>
      {({ tokens, getTokenProps }) => {
        const lineTokens = tokens[0] ?? []
        const keyedTokens = keyByValue(
          lineTokens,
          (token) => token.content || "empty"
        )
        return (
          <span className="whitespace-pre">
            {keyedTokens.map(({ key, item: token }) => {
              const tokenProps = getTokenProps({ token })
              delete (tokenProps as { key?: unknown }).key
              return <span key={key} {...tokenProps} />
            })}
          </span>
        )
      }}
    </Highlight>
  )
}

export function CodeDiffViewer({
  rawDiff = "",
  language = "python",
}: CodeDiffViewerProps) {
  const [diffMode, setDiffMode] = React.useState<"split" | "unified">("split")
  const { copied, copy } = useClipboard()
  const { resolvedTheme } = useTheme()

  const normalizedLanguage = React.useMemo(
    () => normalizeCodeLanguage(language),
    [language]
  )
  const prismTheme = resolvedTheme === "light" ? themes.vsLight : themes.vsDark

  const diffLines = React.useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff])
  const splitRows = React.useMemo(
    () => buildSplitDiffRows(diffLines),
    [diffLines]
  )

  const handleCopy = React.useCallback(() => {
    void copy(rawDiff)
  }, [copy, rawDiff])

  if (!rawDiff) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No code diff available for this challenge.
      </div>
    )
  }

  return (
    <div data-testid="code-diff-viewer" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            Canonical Code Fix Diff
          </span>
          <Badge variant="outline" size="sm">
            Before vs After Fix
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant={diffMode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDiffMode("split")}
              className="h-8 px-2.5 text-xs"
              data-testid="diff-mode-split"
            >
              Side-by-Side
            </Button>
            <Button
              type="button"
              variant={diffMode === "unified" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDiffMode("unified")}
              className="h-8 px-2.5 text-xs"
              data-testid="diff-mode-unified"
            >
              Unified
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5 text-xs"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" className="size-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="size-3" />
                <span>Copy Diff</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {diffMode === "split" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-muted/20 font-mono text-xs">
          <div className="grid grid-cols-1 border-b border-border bg-muted/40 text-xs font-semibold md:grid-cols-2">
            <div className="border-b border-border px-4 py-2 text-rose-600 md:border-r md:border-b-0 dark:text-rose-400">
              Before Fix (Original Defect)
            </div>
            <div className="px-4 py-2 text-emerald-600 dark:text-emerald-400">
              After Fix (Recommended Solution)
            </div>
          </div>

          <div className="divide-y divide-border/60 leading-relaxed">
            {splitRows.map((row) => {
              if (row.type === "hunk") {
                return (
                  <div
                    key={row.id}
                    className="bg-sky-500/10 px-3 py-1 font-mono text-xs text-sky-600 dark:text-sky-400"
                  >
                    {row.hunkHeader}
                  </div>
                )
              }

              return (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-2">
                  <div
                    className={cn(
                      "flex min-h-[22px] min-w-0 items-start border-b border-border/60 px-2.5 py-0.5 md:border-r md:border-b-0",
                      row.left?.type === "deleted"
                        ? "bg-rose-500/10 text-foreground"
                        : "text-foreground"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-xs text-muted-foreground tabular-nums select-none">
                      {row.left?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-rose-600 select-none dark:text-rose-400">
                      {row.left?.type === "deleted" ? "-" : " "}
                    </span>
                    <div className="min-w-0 flex-1 overflow-x-auto">
                      <HighlightedDiffLine
                        code={row.left?.content ?? ""}
                        language={normalizedLanguage}
                        theme={prismTheme}
                      />
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex min-h-[22px] min-w-0 items-start px-2.5 py-0.5",
                      row.right?.type === "added"
                        ? "bg-emerald-500/10 text-foreground"
                        : "text-foreground"
                    )}
                  >
                    <span className="w-8 shrink-0 pr-3 text-right font-mono text-xs text-muted-foreground tabular-nums select-none">
                      {row.right?.lineNumber ?? ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold text-emerald-600 select-none dark:text-emerald-400">
                      {row.right?.type === "added" ? "+" : " "}
                    </span>
                    <div className="min-w-0 flex-1 overflow-x-auto">
                      <HighlightedDiffLine
                        code={row.right?.content ?? ""}
                        language={normalizedLanguage}
                        theme={prismTheme}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed">
          {diffLines.map((line) => {
            if (line.type === "hunk") {
              return (
                <div
                  key={line.id}
                  className="bg-sky-500/10 px-2 py-0.5 text-sky-600 dark:text-sky-400"
                >
                  {line.content}
                </div>
              )
            }
            if (line.type === "header") {
              return (
                <div key={line.id} className="text-muted-foreground">
                  {line.content}
                </div>
              )
            }
            if (line.type === "deleted") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-rose-500/10 text-foreground"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground tabular-nums select-none">
                    {line.oldLineNumber}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground select-none">
                    {" "}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-rose-600 select-none dark:text-rose-400">
                    -
                  </span>
                  <HighlightedDiffLine
                    code={line.content}
                    language={normalizedLanguage}
                    theme={prismTheme}
                  />
                </div>
              )
            }
            if (line.type === "added") {
              return (
                <div
                  key={line.id}
                  className="flex items-start bg-emerald-500/10 text-foreground"
                >
                  <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground select-none">
                    {" "}
                  </span>
                  <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground tabular-nums select-none">
                    {line.newLineNumber}
                  </span>
                  <span className="w-4 shrink-0 font-bold text-emerald-600 select-none dark:text-emerald-400">
                    +
                  </span>
                  <HighlightedDiffLine
                    code={line.content}
                    language={normalizedLanguage}
                    theme={prismTheme}
                  />
                </div>
              )
            }
            return (
              <div key={line.id} className="flex items-start text-foreground">
                <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground tabular-nums select-none">
                  {line.oldLineNumber}
                </span>
                <span className="w-8 shrink-0 pr-2 text-right text-xs text-muted-foreground tabular-nums select-none">
                  {line.newLineNumber}
                </span>
                <span className="w-4 shrink-0 select-none"> </span>
                <HighlightedDiffLine
                  code={line.content}
                  language={normalizedLanguage}
                  theme={prismTheme}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
