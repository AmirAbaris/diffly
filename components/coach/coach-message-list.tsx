"use client"

import * as React from "react"
import { AlertCircle, Brain, Check, Copy, Sparkles } from "lucide-react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
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
    <>
      {message.parts.map((part, index) => {
        const partKey = `${message.id}-part-${index}`

        if (part.type === "reasoning") {
          const hasFollowingText = message.parts
            .slice(index + 1)
            .some((next) => next.type === "text" && next.text.trim().length > 0)
          const isPartStreaming =
            isActiveStream && (part.state === "streaming" || !hasFollowingText)

          if (!part.text.trim() && !isPartStreaming) return null

          return (
            <Trace key={partKey} data-testid="coach-reasoning">
              <TraceCollapsible defaultOpen={isPartStreaming}>
                <TraceCollapsibleTrigger data-testid="coach-reasoning-toggle">
                  <TraceLine status={isPartStreaming ? "running" : undefined}>
                    <TraceIcon>
                      <Brain />
                    </TraceIcon>
                    <TraceTitle>
                      {isPartStreaming ? "Thinking" : "Thought process"}
                    </TraceTitle>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent
                  data-testid="coach-reasoning-content"
                  className="text-xs whitespace-pre-wrap"
                >
                  {part.text}
                </TraceCollapsibleContent>
              </TraceCollapsible>
            </Trace>
          )
        }

        if (part.type === "text") {
          if (!part.text.trim()) return null
          return (
            <Bubble key={partKey} variant="ghost" align="start">
              <BubbleContent className="w-full">
                <MarkdownPreview
                  content={part.text}
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </BubbleContent>
            </Bubble>
          )
        }

        if (part.type === "tool-suggest_targeted_drill") {
          if (
            part.state === "input-streaming" ||
            part.state === "input-available"
          ) {
            return (
              <Trace key={part.toolCallId} data-testid="coach-drill-loading">
                <TraceLine status="running">
                  <TraceIcon>
                    <Sparkles />
                  </TraceIcon>
                  <TraceTitle>Preparing targeted drill</TraceTitle>
                </TraceLine>
              </Trace>
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
              <Trace key={part.toolCallId} role="alert">
                <TraceLine status="error">
                  <TraceIcon>
                    <AlertCircle />
                  </TraceIcon>
                  <TraceTitle>
                    {part.errorText || "Could not prepare targeted drill"}
                  </TraceTitle>
                </TraceLine>
              </Trace>
            )
          }
        }

        return null
      })}
    </>
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
    <MessageScrollerItem messageId={message.id}>
      <Message align="start" data-testid="coach-message-assistant">
        <MessageContent>
          <MessageHeader className="gap-1.5">
            <Sparkles aria-hidden="true" className="size-3.5" />
            <span>Agent Coach</span>
          </MessageHeader>

          <AssistantMessageParts
            message={message}
            isActiveStream={isActiveStream}
            onGenerateDrill={onGenerateDrill}
          />

          {!isActiveStream && plainText ? (
            <MessageFooter>
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
            </MessageFooter>
          ) : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
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
    <>
      {messages.map((message, index) => {
        if (message.role === "user") {
          return (
            <MessageScrollerItem
              key={message.id}
              messageId={message.id}
              scrollAnchor
            >
              <Message align="end" data-testid="coach-message-user">
                <MessageContent>
                  <Bubble variant="secondary" align="end">
                    <BubbleContent className="whitespace-pre-wrap">
                      {extractMessageText(message)}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </MessageScrollerItem>
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
        <MessageScrollerItem messageId="coach-streaming-indicator">
          <Message align="start" data-testid="coach-streaming-indicator">
            <MessageContent>
              <Trace>
                <TraceLine status="running">
                  <TraceIcon>
                    <Sparkles />
                  </TraceIcon>
                  <TraceTitle>Thinking</TraceTitle>
                </TraceLine>
              </Trace>
            </MessageContent>
          </Message>
        </MessageScrollerItem>
      ) : null}
    </>
  )
}
