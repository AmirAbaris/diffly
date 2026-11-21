"use client"

import * as React from "react"
import { Flag } from "lucide-react"
import type { RenderProps } from "prism-react-renderer"
import { keyByValue } from "@/lib/unique-keys"
import { cn } from "@/lib/utils"

export interface LineTokensProps {
  lineTokens: RenderProps["tokens"][number] | undefined
  getTokenProps: RenderProps["getTokenProps"]
  keyPrefix: string
}

export function LineTokens({
  lineTokens,
  getTokenProps,
  keyPrefix,
}: LineTokensProps) {
  if (
    !lineTokens ||
    lineTokens.length === 0 ||
    (lineTokens.length === 1 && lineTokens[0].content === "")
  ) {
    return <span>&#8203;</span>
  }
  const keyed = keyByValue(
    lineTokens,
    (token) => `${keyPrefix}-${token.content || "empty"}`
  )
  return (
    <>
      {keyed.map(({ key, item: token }) => {
        const tokenProps = getTokenProps({ token })
        delete (tokenProps as { key?: unknown }).key
        return <span key={key} {...tokenProps} />
      })}
    </>
  )
}

export interface LineFlagControlProps {
  lineNumber: number
  isFlagged: boolean
  readOnly: boolean
  onToggle: (lineNumber: number) => void
  ariaLabelSuffix?: string
}

export function LineNumberButton({
  lineNumber,
  isFlagged,
  readOnly,
  onToggle,
}: LineFlagControlProps) {
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => {
        if (!readOnly) onToggle(lineNumber)
      }}
      title={
        isFlagged
          ? `Line ${lineNumber} flagged. Click to unflag.`
          : `Click to flag line ${lineNumber} for review`
      }
      className={cn(
        "inline-flex h-5 w-8 items-center justify-center rounded font-mono text-xs tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        readOnly && "cursor-default",
        isFlagged
          ? "bg-amber-500 font-bold text-amber-950"
          : "text-muted-foreground/70 group-hover:text-foreground hover:bg-muted"
      )}
    >
      {lineNumber}
    </button>
  )
}

export function GutterFlagButton({
  lineNumber,
  isFlagged,
  readOnly,
  onToggle,
  ariaLabelSuffix = "",
}: LineFlagControlProps) {
  if (isFlagged) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          if (!readOnly) onToggle(lineNumber)
        }}
        title="Flagged for review"
        aria-label={`Unflag line ${lineNumber}${ariaLabelSuffix}`}
        className="inline-flex items-center justify-center rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 text-amber-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-400"
      >
        <Flag
          aria-hidden="true"
          className="size-3 fill-amber-500 text-amber-500"
        />
      </button>
    )
  }

  if (readOnly) {
    return <span className="block w-3" />
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(lineNumber)}
      title={`Click to flag line ${lineNumber}`}
      aria-label={`Flag line ${lineNumber}${ariaLabelSuffix}`}
      className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity duration-150 group-hover:opacity-70 hover:bg-muted hover:text-amber-500 hover:!opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Flag aria-hidden="true" className="size-3" />
    </button>
  )
}
