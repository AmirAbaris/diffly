"use client"

import * as React from "react"
import { Brain, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CoachReasoningProps {
  text: string
  isStreaming: boolean
}

export function CoachReasoning({ text, isStreaming }: CoachReasoningProps) {
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null)
  const contentId = React.useId()

  const isOpen = userOpen !== null ? userOpen : isStreaming

  if (!text.trim() && !isStreaming) {
    return null
  }

  return (
    <div
      data-testid="coach-reasoning"
      className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
    >
      <button
        type="button"
        onClick={() => setUserOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        data-testid="coach-reasoning-toggle"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="inline-flex items-center gap-2">
          <Brain
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0",
              isStreaming && "animate-pulse motion-reduce:animate-none"
            )}
          />
          <span>{isStreaming ? "Thinking…" : "Thought process"}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen ? (
        <div
          id={contentId}
          data-testid="coach-reasoning-content"
          className="border-t border-border/50 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
        >
          {text}
        </div>
      ) : null}
    </div>
  )
}
