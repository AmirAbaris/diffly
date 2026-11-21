"use client"

import * as React from "react"
import { Highlight, type PrismTheme } from "prism-react-renderer"
import { Prism } from "@/lib/prism-languages"
import { keyByValue } from "@/lib/unique-keys"
import { cn } from "@/lib/utils"
import type { ParsedDiffLine, SplitDiffRow } from "./diff-parser"

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

export function CodeDiffSplitPane({
  splitRows,
  language,
  theme,
}: {
  splitRows: SplitDiffRow[]
  language: string
  theme: PrismTheme
}) {
  return (
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
                    language={language}
                    theme={theme}
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
                    language={language}
                    theme={theme}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CodeDiffUnifiedPane({
  diffLines,
  language,
  theme,
}: {
  diffLines: ParsedDiffLine[]
  language: string
  theme: PrismTheme
}) {
  return (
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
                language={language}
                theme={theme}
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
                language={language}
                theme={theme}
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
              language={language}
              theme={theme}
            />
          </div>
        )
      })}
    </div>
  )
}
