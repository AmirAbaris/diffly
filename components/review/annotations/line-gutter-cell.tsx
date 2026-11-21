"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Copy, Flag, XCircle } from "lucide-react"
import { lineRefKey, type LineRef } from "@/lib/review"
import { cn } from "@/lib/utils"
import { useAnnotationLayer } from "./annotation-layer"
import { useRowAnnotation } from "./use-row-annotation"

export interface LineGutterCellProps {
  at: LineRef
  displayLineNumber: number
  ariaLabelSuffix?: string
  readOnly?: boolean
  defaultTabStop?: boolean
  className?: string
}

const TONE_BUTTON_CLASSES: Record<string, string> = {
  none: "text-muted-foreground/70 group-hover:text-foreground hover:bg-muted",
  flagged: "bg-amber-500 font-bold text-amber-950",
  "verdict-hit":
    "bg-emerald-500/20 font-semibold text-emerald-700 dark:text-emerald-300",
  "verdict-miss":
    "bg-amber-500/20 font-semibold text-amber-700 dark:text-amber-300",
  "verdict-false":
    "bg-rose-500/20 font-semibold text-rose-700 dark:text-rose-300",
  muted: "bg-muted font-medium text-muted-foreground",
}

function RangeBracket({
  edge,
}: {
  edge: "single" | "start" | "middle" | "end" | null
}) {
  if (!edge || edge === "single") return null
  const symbol = edge === "start" ? "┌" : edge === "end" ? "└" : "│"
  return (
    <span
      aria-hidden="true"
      className="font-mono text-[10px] leading-none opacity-80"
    >
      {symbol}
    </span>
  )
}

function GutterGlyph({ tone, visible }: { tone: string; visible: boolean }) {
  const visibilityClass = visible
    ? "opacity-100"
    : "opacity-60 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-80"

  if (tone === "verdict-hit") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
      />
    )
  }
  if (tone === "verdict-miss") {
    return (
      <AlertTriangle
        aria-hidden="true"
        className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
      />
    )
  }
  if (tone === "verdict-false") {
    return (
      <XCircle
        aria-hidden="true"
        className="size-3 shrink-0 text-rose-600 dark:text-rose-400"
      />
    )
  }
  if (tone === "muted") {
    return (
      <Copy
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground"
      />
    )
  }
  if (tone === "flagged") {
    return (
      <Flag
        aria-hidden="true"
        className="size-3 shrink-0 fill-amber-950 text-amber-950"
      />
    )
  }
  return (
    <Flag
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 transition-opacity", visibilityClass)}
    />
  )
}

function formatGutterLabels(
  displayLineNumber: number,
  ariaLabelSuffix: string,
  annotationLabel: string,
  isInteractive: boolean,
  isFlagged: boolean
) {
  if (isInteractive) {
    return {
      ariaLabel: isFlagged
        ? `Unflag line ${displayLineNumber}${ariaLabelSuffix}`
        : `Flag line ${displayLineNumber}${ariaLabelSuffix}`,
      title: isFlagged
        ? `Line ${displayLineNumber} flagged. Click to unflag.`
        : `Click to flag line ${displayLineNumber} for review`,
    }
  }
  return {
    ariaLabel: annotationLabel
      ? `Line ${displayLineNumber}, ${annotationLabel}${ariaLabelSuffix}`
      : `Line ${displayLineNumber}${ariaLabelSuffix}`,
    title: annotationLabel || `Line ${displayLineNumber}`,
  }
}

export function LineGutterCell({
  at,
  displayLineNumber,
  ariaLabelSuffix = "",
  readOnly = false,
  defaultTabStop = false,
  className,
}: LineGutterCellProps) {
  const layer = useAnnotationLayer()
  const annotation = useRowAnnotation(at)
  const isFlagged = annotation.tone === "flagged"
  const isVerdict = annotation.tone !== "none" && annotation.tone !== "flagged"
  const isInteractive = !readOnly && annotation.interactive
  const { ariaLabel, title } = formatGutterLabels(
    displayLineNumber,
    ariaLabelSuffix,
    annotation.label,
    isInteractive,
    isFlagged
  )
  const showGlyphAlways = isFlagged || isVerdict || annotation.isCursor

  return (
    <button
      type="button"
      data-line-key={lineRefKey(at)}
      disabled={readOnly && !isVerdict}
      tabIndex={annotation.isCursor || defaultTabStop ? 0 : -1}
      aria-pressed={isInteractive ? isFlagged : undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={(e) => {
        if (!isInteractive || !layer) return
        layer.activate(at, { shiftKey: e.shiftKey })
      }}
      onFocus={() => {
        if (layer?.setCursor && !annotation.isCursor) {
          layer.setCursor(at)
        }
      }}
      className={cn(
        "inline-flex h-5 min-w-11 items-center justify-end gap-1 rounded px-1.5 font-mono text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        readOnly && "cursor-default",
        annotation.isCursor && "ring-2 ring-ring/70 ring-offset-1",
        TONE_BUTTON_CLASSES[annotation.tone] ?? TONE_BUTTON_CLASSES.none,
        className
      )}
    >
      <RangeBracket edge={annotation.rangeEdge} />
      <GutterGlyph tone={annotation.tone} visible={showGlyphAlways} />
      <span>{displayLineNumber}</span>
    </button>
  )
}
