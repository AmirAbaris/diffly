"use client"

import * as React from "react"
import { AlertCircle, Brain, Check, Copy, Sparkles } from "lucide-react"
import { CoachDrillCard } from "@/components/coach/coach-drill-card"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
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

export interface CoachMessageListProps {
  messages: CoachUIMessage[]
  isStreaming: boolean
  statusPhase?: "submitted" | "streaming"
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
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

function AssistantMessageParts({
  message,
  isActiveStream,
  onGenerateDrill,
}: {
  message: CoachUIMessage
  isActiveStream: boolean
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
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
              <CoachDrillCard
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
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
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
