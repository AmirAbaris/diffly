"use client"

import * as React from "react"
import { AlertCircle, Check, Copy, Loader2, Sparkles } from "lucide-react"
import { CoachReasoning } from "@/components/coach/coach-reasoning"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useClipboard } from "@/hooks/use-clipboard"
import type { CoachUIMessage, TargetedDrillSuggestion } from "@/lib/ai/coach"
import { formatLanguageLabel } from "@/types/challenge"

export interface CoachMessageListProps {
  messages: CoachUIMessage[]
  isStreaming: boolean
  statusPhase?: "submitted" | "streaming"
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}

function extractMessageText(message: CoachUIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim()
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

function AssistantMessageParts({
  message,
  isActiveStream,
  onGenerateDrill,
}: {
  message: CoachUIMessage
  isActiveStream: boolean
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {message.parts.map((part, index) => {
        const partKey = `${message.id}-part-${index}`

        if (part.type === "reasoning") {
          const hasFollowingText = message.parts
            .slice(index + 1)
            .some((next) => next.type === "text" && next.text.trim().length > 0)
          const isPartStreaming =
            isActiveStream && (part.state === "streaming" || !hasFollowingText)

          return (
            <CoachReasoning
              key={partKey}
              text={part.text}
              isStreaming={isPartStreaming}
            />
          )
        }

        if (part.type === "text") {
          if (!part.text.trim()) return null
          return (
            <div key={partKey} className="text-sm text-foreground">
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
                <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
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
}

function AssistantMessageItem({
  message,
  isActiveStream,
  onGenerateDrill,
}: {
  message: CoachUIMessage
  isActiveStream: boolean
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}) {
  const { copied, copy } = useClipboard()
  const plainText = extractMessageText(message)

  return (
    <article
      data-testid="coach-message-assistant"
      className="flex w-full flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-3.5" />
          <span>Agent Coach</span>
        </div>

        {!isActiveStream && plainText ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => void copy(plainText)}
            aria-label={copied ? "Copied response" : "Copy response"}
            data-testid="coach-copy-message-button"
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3" />
            ) : (
              <Copy aria-hidden="true" className="size-3" />
            )}
          </Button>
        ) : null}
      </div>

      <AssistantMessageParts
        message={message}
        isActiveStream={isActiveStream}
        onGenerateDrill={onGenerateDrill}
      />
    </article>
  )
}

export function CoachMessageList({
  messages,
  isStreaming,
  statusPhase,
  onGenerateDrill,
}: CoachMessageListProps) {
  const showSubmittedPulse = statusPhase === "submitted"

  return (
    <div data-testid="coach-message-list" className="flex flex-col gap-6">
      {messages.map((message, index) => {
        if (message.role === "user") {
          return (
            <div
              key={message.id}
              data-testid="coach-message-user"
              className="ml-auto max-w-[82%] rounded-2xl bg-muted/70 px-4 py-2.5 text-sm whitespace-pre-wrap text-foreground"
            >
              {extractMessageText(message)}
            </div>
          )
        }

        const isLastMessage = index === messages.length - 1
        return (
          <AssistantMessageItem
            key={message.id}
            message={message}
            isActiveStream={isStreaming && isLastMessage}
            onGenerateDrill={onGenerateDrill}
          />
        )
      })}

      {showSubmittedPulse ? (
        <div
          data-testid="coach-streaming-indicator"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Sparkles
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-pulse motion-reduce:animate-none"
          />
          <span>Thinking…</span>
        </div>
      ) : null}
    </div>
  )
}
