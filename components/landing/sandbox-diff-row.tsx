"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Flag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SandboxDiffLine } from "@/lib/landing/sandbox-engine"
import { cn } from "@/lib/utils"

export interface SandboxDiffRowProps {
  readonly line: SandboxDiffLine
  readonly isFlagged: boolean
  readonly onRowClick: (
    lineNumber: number,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
}

const LINE_PREFIX_MAP: Readonly<Record<SandboxDiffLine["kind"], string>> = {
  add: "+",
  del: "-",
  context: " ",
}

const UNFLAGGED_ROW_CLASSES: Readonly<Record<SandboxDiffLine["kind"], string>> =
  {
    add: "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12]",
    del: "bg-destructive/[0.06] text-muted-foreground hover:bg-destructive/[0.12]",
    context: "bg-background hover:bg-muted/50",
  }

function getRowSurfaceClass(
  kind: SandboxDiffLine["kind"],
  isFlagged: boolean,
  hasDefect: boolean
): string {
  if (!isFlagged) return UNFLAGGED_ROW_CLASSES[kind]
  if (hasDefect) {
    return "bg-emerald-500/15 hover:bg-emerald-500/20 dark:bg-emerald-500/20"
  }
  return "bg-destructive/15 hover:bg-destructive/20 dark:bg-destructive/20"
}

function getFlagIconClass(hasDefect: boolean): string {
  return hasDefect
    ? "size-3 fill-emerald-500 text-emerald-500"
    : "size-3 fill-destructive text-destructive"
}

export function SandboxDiffRow({
  line,
  isFlagged,
  onRowClick,
}: SandboxDiffRowProps) {
  const hasDefect = Boolean(line.defect)
  const showDefectDrawer = isFlagged && line.defect
  const showFalsePositiveDrawer = isFlagged && !line.defect

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={(event) => onRowClick(line.lineNumber, event)}
        aria-pressed={isFlagged}
        data-testid={`sandbox-diff-line-${line.lineNumber}`}
        data-line-kind={line.kind}
        data-line-flagged={isFlagged ? "true" : "false"}
        className={cn(
          "group flex w-full items-stretch text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
          getRowSurfaceClass(line.kind, isFlagged, hasDefect)
        )}
      >
        <span className="flex w-10 shrink-0 items-center justify-end border-r border-border/60 px-2 py-2 text-[11px] text-muted-foreground/70 tabular-nums select-none">
          {line.oldLineNumber ?? ""}
        </span>
        <span className="flex w-10 shrink-0 items-center justify-end border-r border-border/60 px-2 py-2 text-[11px] text-muted-foreground/70 tabular-nums select-none">
          {line.newLineNumber ?? ""}
        </span>
        <span className="flex w-9 shrink-0 items-center justify-center gap-0.5 py-2 text-[11px] select-none">
          <span className="text-muted-foreground/70 group-hover:text-foreground">
            {LINE_PREFIX_MAP[line.kind]}
          </span>
          {isFlagged ? (
            <Flag aria-hidden="true" className={getFlagIconClass(hasDefect)} />
          ) : null}
        </span>
        <code className="flex-1 py-2 pr-4 whitespace-pre text-foreground">
          {line.content}
        </code>
      </button>

      {showDefectDrawer ? (
        <div
          data-testid={`sandbox-defect-drawer-${line.lineNumber}`}
          className="border-t border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-3 font-sans text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="size-3.5 text-emerald-500"
              />
              <span>{showDefectDrawer.title}</span>
            </div>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {showDefectDrawer.category} ·{" "}
              {showDefectDrawer.severity.toUpperCase()}
            </Badge>
          </div>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">
            {showDefectDrawer.explanation}
          </p>
          <p className="mt-1 font-mono text-[11px] text-foreground/90">
            Fix: {showDefectDrawer.remediation}
          </p>
        </div>
      ) : null}

      {showFalsePositiveDrawer ? (
        <div
          data-testid={`sandbox-fp-drawer-${line.lineNumber}`}
          className="border-t border-destructive/30 bg-destructive/[0.08] px-4 py-2.5 font-sans text-xs"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            <span className="font-medium">
              False Positive: This line does not introduce a defect.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
