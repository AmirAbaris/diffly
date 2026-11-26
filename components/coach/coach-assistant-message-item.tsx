"use client"

import * as React from "react"
import { AlertCircle, Brain, Check, Copy, RotateCcw } from "lucide-react"
import { CoachChallengeConfigCard } from "@/components/coach/coach-challenge-config-card"
import { CoachDebriefTrace } from "@/components/coach/coach-debrief-trace"
import { CoachDrillCard } from "@/components/coach/coach-drill-card"
import type { CoachChallengeToolController } from "@/components/coach/use-coach-challenge-tool"
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

export interface CoachAssistantMessageItemProps {
  message: CoachUIMessage
  plainText: string
  isActiveStream: boolean
  isLatestAssistant: boolean
  isStreaming: boolean
  isMutating: boolean
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
  challengeTool?: CoachChallengeToolController
  onRegenerate?: () => void
}

function AssistantMessageParts({
  message,
  isActiveStream,
  onGenerateDrill,
  challengeTool,
}: {
  message: CoachUIMessage
  isActiveStream: boolean
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
  challengeTool?: CoachChallengeToolController
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

        if (part.type === "tool-configure_challenge") {
          if (part.state === "input-streaming") {
            return (
              <Trace
                key={part.toolCallId}
                data-testid="coach-configure-loading"
              >
                <TraceLine status="running">
                  <TraceTitle>Preparing challenge options</TraceTitle>
                </TraceLine>
              </Trace>
            )
          }

          if (
            part.state === "input-available" ||
            part.state === "output-available"
          ) {
            return (
              <CoachChallengeConfigCard
                key={part.toolCallId}
                part={part}
                controller={challengeTool}
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
                    {part.errorText || "Could not prepare challenge options"}
                  </TraceTitle>
                </TraceLine>
              </Trace>
            )
          }
        }

        if (part.type === "tool-get_submission_debrief") {
          return <CoachDebriefTrace key={part.toolCallId} part={part} />
        }

        return null
      })}
    </>
  )
}

export function CoachAssistantMessageItem({
  message,
  plainText,
  isActiveStream,
  isLatestAssistant,
  isStreaming,
  isMutating,
  onGenerateDrill,
  challengeTool,
  onRegenerate,
}: CoachAssistantMessageItemProps) {
  const { copied, copy } = useClipboard()
  const showRegenerate =
    isLatestAssistant && !isStreaming && Boolean(onRegenerate)
  const showFooter = !isActiveStream && (Boolean(plainText) || showRegenerate)

  return (
    <MessageScrollerItem messageId={message.id}>
      <Message align="start" data-testid="coach-message-assistant">
        <MessageContent>
          <MessageHeader>
            <span>Agent Coach</span>
          </MessageHeader>

          <AssistantMessageParts
            message={message}
            isActiveStream={isActiveStream}
            onGenerateDrill={onGenerateDrill}
            challengeTool={challengeTool}
          />

          {showFooter ? (
            <MessageFooter>
              {plainText ? (
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
              {showRegenerate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={isMutating}
                  onClick={onRegenerate}
                  aria-label="Regenerate response"
                  data-testid="coach-regenerate-message-button"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw aria-hidden="true" className="size-3" />
                </Button>
              ) : null}
            </MessageFooter>
          ) : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}
