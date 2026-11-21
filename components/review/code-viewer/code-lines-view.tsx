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
import { Prism } from "@/lib/prism-languages"
import type { LineRef } from "@/lib/review"
import { cn } from "@/lib/utils"
import { LineTokens } from "./line-tokens"

interface HighlightedLine {
  id: string
  lineNumber: number
  lineTokens: RenderProps["tokens"][number]
}

export interface CodeLinesViewProps {
  code: string
  filePath?: string | null
  normalizedLanguage: string
  theme: PrismTheme
  readOnly?: boolean
}

const ROW_TONE_CLASSES: Record<string, string> = {
  none: "hover:bg-muted/50",
  flagged: "bg-amber-500/15 dark:bg-amber-500/20",
  "verdict-hit": "bg-emerald-500/10",
  "verdict-miss": "bg-amber-500/10",
  "verdict-false": "bg-rose-500/10",
  muted: "bg-muted/40",
}

const CodeLineRow = React.memo(function CodeLineRow({
  line,
  filePath,
  readOnly,
  defaultTabStop,
  lineClassName,
  lineStyle,
  getTokenProps,
}: {
  line: HighlightedLine
  filePath: string | null
  readOnly: boolean
  defaultTabStop: boolean
  lineClassName?: string
  lineStyle?: React.CSSProperties
  getTokenProps: RenderProps["getTokenProps"]
}) {
  const at = React.useMemo<LineRef>(
    () => ({ file: filePath, line: line.lineNumber }),
    [filePath, line.lineNumber]
  )
  const annotation = useRowAnnotation(at)

  return (
    <>
      <tr
        role="row"
        className={cn(
          "group transition-colors",
          ROW_TONE_CLASSES[annotation.tone] ?? ROW_TONE_CLASSES.none
        )}
      >
        <td
          role="gridcell"
          className="w-14 px-1.5 py-0.5 text-right align-top select-none"
        >
          <LineGutterCell
            at={at}
            displayLineNumber={line.lineNumber}
            readOnly={readOnly}
            defaultTabStop={defaultTabStop}
          />
        </td>

        <td
          role="gridcell"
          className={cn(
            "px-2 py-0.5 align-top font-mono text-xs leading-5 whitespace-pre text-foreground",
            lineClassName
          )}
          style={lineStyle}
        >
          <LineTokens
            lineTokens={line.lineTokens}
            getTokenProps={getTokenProps}
            keyPrefix={`diffly-tok-${line.lineNumber}`}
          />
        </td>
      </tr>
      <InlineThreadRow at={at} colSpan={2} />
    </>
  )
})

export function CodeLinesView({
  code,
  filePath = null,
  normalizedLanguage,
  theme,
  readOnly = false,
}: CodeLinesViewProps) {
  return (
    <div className="[container-type:inline-size] overflow-x-auto p-1">
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
            }
          })

          return (
            <table
              role="grid"
              aria-label="Source code lines"
              className="w-full border-collapse font-mono text-xs leading-5"
            >
              <tbody>
                {lines.map((line, index) => {
                  const lineProps = getLineProps({ line: line.lineTokens })
                  return (
                    <CodeLineRow
                      key={line.id}
                      line={line}
                      filePath={filePath}
                      readOnly={readOnly}
                      defaultTabStop={index === 0}
                      lineClassName={lineProps.className}
                      lineStyle={lineProps.style}
                      getTokenProps={getTokenProps}
                    />
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
