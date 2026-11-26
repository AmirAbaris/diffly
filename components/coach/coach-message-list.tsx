"use client"

import * as React from "react"
import { CoachAssistantMessageItem } from "@/components/coach/coach-assistant-message-item"
import { CoachUserMessageItem } from "@/components/coach/coach-user-message-item"
import type { CoachChallengeToolController } from "@/components/coach/use-coach-challenge-tool"
import type { CoachHistoryMutationResult } from "@/components/coach/use-coach-chat"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Trace, TraceLine, TraceTitle } from "@/components/ui/trace"
import type { CoachUIMessage, TargetedDrillSuggestion } from "@/lib/ai/coach"

export interface CoachMessageListProps {
  messages: CoachUIMessage[]
  isStreaming: boolean
  statusPhase?: "submitted" | "streaming"
  isMutating?: boolean
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
  challengeTool?: CoachChallengeToolController
  onRegenerate?: () => void
  onEditAndResend?: (
    messageId: string,
    nextText: string
  ) => Promise<CoachHistoryMutationResult>
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

export function CoachMessageList({
  messages,
  isStreaming,
  statusPhase,
  isMutating = false,
  onGenerateDrill,
  challengeTool,
  onRegenerate,
  onEditAndResend,
}: CoachMessageListProps) {
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(
    null
  )

  const activeEditingId = isStreaming ? null : editingMessageId
  const showSubmittedPulse = statusPhase === "submitted"

  return (
    <>
      {messages.map((message, index) => {
        if (message.role === "user") {
          return (
            <CoachUserMessageItem
              key={message.id}
              messageId={message.id}
              text={extractMessageText(message)}
              isEditing={activeEditingId === message.id}
              isStreaming={isStreaming}
              isMutating={isMutating}
              onStartEdit={
                onEditAndResend
                  ? () => setEditingMessageId(message.id)
                  : undefined
              }
              onCancelEdit={() => setEditingMessageId(null)}
              onEditAndResend={onEditAndResend}
            />
          )
        }

        const isLastMessage = index === messages.length - 1
        const hasPrecedingUser =
          isLastMessage &&
          messages.slice(0, index).some((m) => m.role === "user")

        return (
          <CoachAssistantMessageItem
            key={message.id}
            message={message}
            plainText={extractMessageText(message)}
            isActiveStream={isStreaming && isLastMessage}
            isLatestAssistant={hasPrecedingUser}
            isStreaming={isStreaming}
            isMutating={isMutating}
            onGenerateDrill={onGenerateDrill}
            challengeTool={challengeTool}
            onRegenerate={onRegenerate}
          />
        )
      })}

      {showSubmittedPulse ? (
        <MessageScrollerItem messageId="coach-streaming-indicator">
          <Message align="start" data-testid="coach-streaming-indicator">
            <MessageContent>
              <Trace>
                <TraceLine status="running">
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
