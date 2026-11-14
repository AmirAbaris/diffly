"use client"

import * as React from "react"
import { FileCode, Flag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
      className="flex flex-col font-mono text-xs"
      data-testid="flagging-guide-demo"
    >
      <div className="flex h-9 items-center justify-between border-b border-border bg-muted/40 px-3">
        <div className="flex items-center gap-2">
          <FileCode
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          <span className="font-semibold text-foreground">auth_service.py</span>
          <Badge variant="outline" size="sm">
            Interactive Demo
          </Badge>
        </div>
        <span className="font-sans text-xs text-muted-foreground">
          Click a line number to test
        </span>
      </div>

      <div className="overflow-x-auto p-1">
        <table className="w-full border-collapse font-mono text-xs leading-5">
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
                      : "hover:bg-muted/50"
                  )}
                >
                  <td className="w-10 px-2 py-0.5 text-right align-middle select-none">
                    <button
                      type="button"
                      onClick={() => toggleDemoLine(line.num)}
                      aria-label={`Demo toggle line ${line.num}`}
                      className={cn(
                        "inline-flex h-5 w-7 items-center justify-center rounded font-mono text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        isFlagged
                          ? "bg-amber-500 font-bold text-amber-950"
                          : "text-muted-foreground/60 group-hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {line.num}
                    </button>
                  </td>

                  <td className="w-8 px-1 py-0.5 text-center align-middle select-none">
                    {isFlagged ? (
                      <button
                        type="button"
                        onClick={() => toggleDemoLine(line.num)}
                        title="Flagged line. Click to unflag."
                        aria-label={`Unflag demo line ${line.num}`}
                        className="inline-flex items-center justify-center rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 text-amber-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-400"
                      >
                        <Flag
                          aria-hidden="true"
                          className="size-3 fill-amber-500 text-amber-500"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleDemoLine(line.num)}
                        title="Click to flag line"
                        aria-label={`Flag demo line ${line.num}`}
                        className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-70 hover:text-amber-500 hover:!opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Flag aria-hidden="true" className="size-3" />
                      </button>
                    )}
                  </td>

                  <td
                    className={cn(
                      "px-2 py-0.5 font-mono text-xs leading-5 whitespace-pre",
                      line.isVulnerable
                        ? "font-medium text-foreground"
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

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 font-sans text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">Flagged lines:</span>
          {demoFlaggedLines.length > 0 ? (
            demoFlaggedLines.map((num) => (
              <Badge
                key={num}
                variant="warning"
                size="sm"
                className="font-mono tabular-nums"
              >
                L{num}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">None selected</span>
          )}
        </div>
        {demoFlaggedLines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setDemoFlaggedLines([])}
            className="text-muted-foreground hover:text-destructive"
          >
            Reset demo
          </Button>
        )}
      </div>
    </div>
  )
}
