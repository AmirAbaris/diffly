"use client"

import * as React from "react"
import { AlertCircle, Loader2, Sparkles } from "lucide-react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { CoachUIMessage, TargetedDrillSuggestion } from "@/lib/ai/coach"
import { formatLanguageLabel } from "@/types/challenge"

export interface CoachMessageListProps {
  messages: CoachUIMessage[]
  isStreaming: boolean
  emptyTitle?: string
  emptyDescription?: string
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}

function DrillSuggestionCard({
  drill,
  onGenerateDrill,
}: {
  drill: TargetedDrillSuggestion
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}) {
  return (
    <Card
      data-testid="coach-drill-suggestion-card"
      className="gap-0 border-border bg-card py-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Targeted Practice Drill
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" size="sm" className="font-mono">
              {formatLanguageLabel(drill.language)}
            </Badge>
            <Badge variant="outline" size="sm">
              {drill.difficulty}
            </Badge>
          </div>
        </div>
        <p className="text-sm font-medium text-balance text-foreground">
          {drill.topic}
        </p>
        {drill.rationale ? (
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            {drill.rationale}
          </p>
        ) : null}
        <div className="pt-0.5">
          <Button
            type="button"
            size="sm"
            onClick={() => onGenerateDrill(drill)}
            data-testid="coach-generate-drill-button"
          >
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            <span>Generate Targeted Drill</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function CoachMessageList({
  messages,
  isStreaming,
  emptyTitle = "Start a coaching session",
  emptyDescription = "Pick a quick prompt above or ask a question about your code review performance.",
  onGenerateDrill,
}: CoachMessageListProps) {
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (
      (messages.length > 0 || isStreaming) &&
      typeof bottomRef.current?.scrollIntoView === "function"
    ) {
      bottomRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [messages.length, isStreaming])

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Agent Coach conversation"
      data-testid="coach-message-list"
      className="flex max-h-96 flex-col gap-3 overflow-y-auto overscroll-contain rounded-lg border border-border/70 bg-muted/20 p-3"
    >
      {messages.length === 0 ? (
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-sm">{emptyTitle}</EmptyTitle>
            <EmptyDescription className="text-xs">
              {emptyDescription}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        messages.map((message) => {
          if (message.role === "user") {
            const text = message.parts
              .filter(
                (part): part is Extract<typeof part, { type: "text" }> =>
                  part.type === "text"
              )
              .map((part) => part.text)
              .join("")
            return (
              <div
                key={message.id}
                data-testid="coach-message-user"
                className="ml-auto max-w-[85%] rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm whitespace-pre-wrap text-foreground"
              >
                {text}
              </div>
            )
          }

          return (
            <div
              key={message.id}
              data-testid="coach-message-assistant"
              className="mr-auto flex w-full max-w-[92%] flex-col gap-2"
            >
              {message.parts.map((part) => {
                if (part.type === "text") {
                  if (!part.text.trim()) return null
                  return (
                    <div
                      key={`${message.id}-text-${part.text.length}-${part.text.slice(0, 16)}`}
                      className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground"
                    >
                      <MarkdownPreview
                        content={part.text}
                        className="border-0 bg-transparent p-0 shadow-none"
                      />
                    </div>
                  )
                }

                if (part.type === "tool-suggest_targeted_drill") {
                  if (
                    part.state === "input-streaming" ||
                    part.state === "input-available"
                  ) {
                    return (
                      <div
                        key={part.toolCallId}
                        data-testid="coach-drill-loading"
                        className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                      >
                        <Loader2
                          aria-hidden="true"
                          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                        />
                        <span>Preparing targeted drill…</span>
                      </div>
                    )
                  }

                  if (part.state === "output-available" && part.output) {
                    return (
                      <DrillSuggestionCard
                        key={part.toolCallId}
                        drill={part.output}
                        onGenerateDrill={onGenerateDrill}
                      />
                    )
                  }

                  if (part.state === "output-error") {
                    return (
                      <div
                        key={part.toolCallId}
                        role="alert"
                        className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      >
                        <AlertCircle
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        <span>
                          {part.errorText ||
                            "Could not prepare targeted drill suggestion."}
                        </span>
                      </div>
                    )
                  }
                }

                return null
              })}
            </div>
          )
        })
      )}

      {isStreaming ? (
        <div
          data-testid="coach-streaming-indicator"
          className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
        >
          <Loader2
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          />
          <span>Coach is thinking…</span>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  )
}
