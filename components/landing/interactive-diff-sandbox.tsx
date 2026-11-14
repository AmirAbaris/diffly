"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, RotateCcw } from "lucide-react"
import { SandboxDiffRow } from "@/components/landing/sandbox-diff-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  SandboxEvaluationReadout,
  SandboxScenario,
  ScenarioId,
} from "@/lib/landing/sandbox-engine"
import { cn } from "@/lib/utils"

export interface InteractiveDiffSandboxProps {
  readonly scenarios: readonly SandboxScenario[]
  readonly activeScenario: SandboxScenario
  readonly flaggedLineNumbers: ReadonlySet<number>
  readonly readout: SandboxEvaluationReadout
  readonly onSelectScenario: (id: ScenarioId) => void
  readonly onToggleLine: (lineNumber: number, rowNormalizedY: number) => void
  readonly onResetScenario: () => void
}

export function InteractiveDiffSandbox({
  scenarios,
  activeScenario,
  flaggedLineNumbers,
  readout,
  onSelectScenario,
  onToggleLine,
  onResetScenario,
}: InteractiveDiffSandboxProps) {
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null)
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  function handleTabKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const delta = event.key === "ArrowRight" ? 1 : -1
    const nextIndex = (index + delta + scenarios.length) % scenarios.length
    const nextScenario = scenarios[nextIndex]
    onSelectScenario(nextScenario.id)
    tabRefs.current[nextScenario.id]?.focus()
  }

  function handleRowClick(
    lineNumber: number,
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    const container = tableContainerRef.current
    if (!container) {
      onToggleLine(lineNumber, 0.5)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const rowRect = event.currentTarget.getBoundingClientRect()
    const rowCenterY = rowRect.top + rowRect.height * 0.5
    const normalizedY =
      containerRect.height > 0
        ? (rowCenterY - containerRect.top) / containerRect.height
        : 0.5
    onToggleLine(lineNumber, normalizedY)
  }

  const activeTabId = `sandbox-tab-${activeScenario.id}`
  const activePanelId = `sandbox-panel-${activeScenario.id}`

  return (
    <div
      data-testid="interactive-diff-sandbox"
      className="flex flex-col justify-between bg-card/40"
    >
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:px-5">
          <div
            role="tablist"
            aria-label="Live diff scenarios"
            className="flex flex-wrap items-center gap-1.5"
          >
            {scenarios.map((scenario, index) => {
              const isSelected = scenario.id === activeScenario.id
              return (
                <button
                  key={scenario.id}
                  ref={(node) => {
                    tabRefs.current[scenario.id] = node
                  }}
                  id={`sandbox-tab-${scenario.id}`}
                  type="button"
                  role="tab"
                  tabIndex={isSelected ? 0 : -1}
                  aria-selected={isSelected}
                  aria-controls={`sandbox-panel-${scenario.id}`}
                  data-testid={`sandbox-scenario-tab-${scenario.id}`}
                  onClick={() => onSelectScenario(scenario.id)}
                  onKeyDown={(e) => handleTabKeyDown(index, e)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isSelected
                      ? "border-foreground/30 bg-background text-foreground shadow-2xs"
                      : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {scenario.codeLabel}
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onResetScenario}
            disabled={flaggedLineNumbers.size === 0}
            data-testid="sandbox-reset-btn"
            className="font-mono text-[11px] text-muted-foreground"
          >
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            <span>Reset Flags</span>
          </Button>
        </div>

        <div
          id={activePanelId}
          role="tabpanel"
          aria-labelledby={activeTabId}
          className="flex flex-col"
        >
          <div className="flex flex-col gap-1 border-b border-border bg-background/60 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-foreground">
                  {activeScenario.filePath}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {activeScenario.agentModelLabel}
                </Badge>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                Click any diff line to flag a defect
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeScenario.prSummary}
            </p>
          </div>

          <div
            ref={tableContainerRef}
            className="divide-y divide-border/50 overflow-x-auto font-mono text-xs"
          >
            {activeScenario.lines.map((line) => (
              <SandboxDiffRow
                key={line.lineNumber}
                line={line}
                isFlagged={flaggedLineNumbers.has(line.lineNumber)}
                onRowClick={handleRowClick}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
        <div
          aria-live="polite"
          data-testid="sandbox-status-banner"
          className="flex items-center gap-2 text-xs"
        >
          {readout.isScenarioSolved ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Target defect isolated with 100% precision.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Isolated {readout.detectedDefects} of {readout.totalDefects}{" "}
              ground-truth defect(s) in this diff
              {readout.falsePositives > 0
                ? ` (${readout.falsePositives} false positive${readout.falsePositives > 1 ? "s" : ""}).`
                : "."}
            </span>
          )}
        </div>

        <Link
          href={`/challenges/${activeScenario.challengeSlug}`}
          data-testid="sandbox-open-full-challenge-link"
          className="inline-flex items-center gap-1 font-mono text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          <span>Open Full Arena Challenge</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
