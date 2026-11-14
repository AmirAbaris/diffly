"use client"

import * as React from "react"
import { Code2, Flag, MousePointerClick } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface DemoLine {
  num: number
  code: string
  isVulnerable?: boolean
}

const DEMO_LINES: DemoLine[] = [
  { num: 1, code: "def verify_jwt_token(token: str):" },
  { num: 2, code: "    # Flaw: accepts unverified 'none' algorithm" },
  { num: 3, code: '    header, payload, sig = token.split(".")' },
  {
    num: 4,
    code: '    if json.loads(header).get("alg") == "none":',
    isVulnerable: true,
  },
  { num: 5, code: "        return json.loads(payload)  # Defect!" },
]

export function FlaggingGuideDemo() {
  const [demoFlaggedLines, setDemoFlaggedLines] = React.useState<number[]>([4])

  const toggleDemoLine = React.useCallback((lineNum: number) => {
    setDemoFlaggedLines((prev) =>
      prev.includes(lineNum)
        ? prev.filter((n) => n !== lineNum)
        : [...prev, lineNum].sort((a, b) => a - b)
    )
  }, [])

  return (
    <div
      className="flex flex-col p-3.5 sm:p-4"
      data-testid="flagging-guide-demo"
    >
      {/* Demo Header Bar */}
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex items-center gap-2">
          <Code2 className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-xs font-medium text-foreground">
            auth_service.py
          </span>
          <Badge variant="outline" size="sm" className="text-[10px] uppercase">
            Interactive Demo
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MousePointerClick className="size-3 text-amber-500" />
          <span>Click line numbers to test</span>
        </div>
      </div>

      {/* Demo Code Box */}
      <div className="mt-2.5 overflow-x-auto rounded border border-border/70 bg-card/60 p-1 font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {DEMO_LINES.map((line) => {
              const isFlagged = demoFlaggedLines.includes(line.num)
              return (
                <tr
                  key={line.num}
                  className={cn(
                    "group transition-colors",
                    isFlagged
                      ? "bg-amber-500/15 dark:bg-amber-500/20"
                      : "hover:bg-muted/60"
                  )}
                >
                  {/* Line Number Button */}
                  <td className="w-10 py-1 pr-1 text-right align-middle select-none">
                    <button
                      type="button"
                      onClick={() => toggleDemoLine(line.num)}
                      aria-label={`Demo toggle line ${line.num}`}
                      className={cn(
                        "inline-flex h-5 w-7 items-center justify-center rounded font-mono text-[11px] tabular-nums transition-colors",
                        isFlagged
                          ? "bg-amber-500 font-bold text-amber-950"
                          : "text-muted-foreground/60 group-hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {line.num}
                    </button>
                  </td>

                  {/* Flag Icon Slot */}
                  <td className="w-7 py-1 text-center align-middle select-none">
                    {isFlagged ? (
                      <button
                        type="button"
                        onClick={() => toggleDemoLine(line.num)}
                        title="Flagged line. Click to unflag."
                        className="inline-flex items-center justify-center rounded p-0.5 text-amber-500"
                      >
                        <Flag className="size-3 fill-amber-500 text-amber-500" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleDemoLine(line.num)}
                        title="Click to flag line"
                        className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-70 hover:text-amber-500 hover:!opacity-100"
                      >
                        <Flag className="size-3" />
                      </button>
                    )}
                  </td>

                  {/* Code Content */}
                  <td
                    className={cn(
                      "py-1 pl-1 font-mono text-[11px] leading-5 whitespace-pre",
                      line.isVulnerable
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {line.code}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Demo Action Strip preview */}
      <div className="mt-2.5 flex items-center justify-between rounded border border-border/70 bg-muted/40 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">Flagged lines:</span>
          {demoFlaggedLines.length > 0 ? (
            demoFlaggedLines.map((num) => (
              <Badge
                key={num}
                variant="warning"
                size="sm"
                className="font-mono text-[10px] tabular-nums"
              >
                L{num}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground italic">
              None selected
            </span>
          )}
        </div>
        {demoFlaggedLines.length > 0 && (
          <button
            type="button"
            onClick={() => setDemoFlaggedLines([])}
            className="text-[11px] text-muted-foreground hover:text-destructive"
          >
            Reset demo
          </button>
        )}
      </div>

      {/* Upload hint banner */}
      <div className="mt-2 flex items-center justify-between rounded bg-muted/60 px-2.5 py-1 text-[10px] text-muted-foreground">
        <span className="truncate">
          GIF Placeholder: Place your recording at{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-[10px] text-foreground">
            public/guides/flag-line-tutorial.gif
          </code>
        </span>
        <Badge
          variant="outline"
          size="sm"
          className="hidden shrink-0 text-[9px] sm:inline-flex"
        >
          Auto-detects GIF
        </Badge>
      </div>
    </div>
  )
}
