"use client"

import * as React from "react"
import { AlertCircle, Pencil } from "lucide-react"
import type { CoachHistoryMutationResult } from "@/components/coach/use-coach-chat"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Textarea } from "@/components/ui/textarea"

export interface CoachUserMessageItemProps {
  messageId: string
  text: string
  isEditing: boolean
  isStreaming: boolean
  isMutating: boolean
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEditAndResend?: (
    messageId: string,
    nextText: string
  ) => Promise<CoachHistoryMutationResult>
}

function UserMessageEditor({
  messageId,
  initialText,
  isMutating,
  onCancelEdit,
  onEditAndResend,
}: {
  messageId: string
  initialText: string
  isMutating: boolean
  onCancelEdit?: () => void
  onEditAndResend?: (
    messageId: string,
    nextText: string
  ) => Promise<CoachHistoryMutationResult>
}) {
  const [draft, setDraft] = React.useState(initialText)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const canSave = draft.trim().length > 0 && !isSaving && !isMutating

  const handleSave = async () => {
    if (!onEditAndResend || !canSave) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await onEditAndResend(messageId, draft)
      if (result.ok) {
        onCancelEdit?.()
      } else {
        setError(result.error ?? "Could not update message.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      if (!isSaving) {
        onCancelEdit?.()
      }
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void handleSave()
    }
  }

  return (
    <Bubble variant="secondary" align="end" className="w-full">
      <BubbleContent className="flex w-full flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          aria-label="Edit message"
          aria-invalid={error ? true : undefined}
          data-testid="coach-edit-message-input"
          autoFocus
          className="min-h-20 bg-background text-sm"
        />
        {error ? (
          <div
            role="alert"
            data-testid="coach-edit-error"
            className="flex items-center gap-1.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isSaving}
            onClick={onCancelEdit}
            data-testid="coach-edit-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={!canSave}
            onClick={() => void handleSave()}
            data-testid="coach-edit-save-button"
          >
            {isSaving ? "Saving…" : "Save & Send"}
          </Button>
        </div>
      </BubbleContent>
    </Bubble>
  )
}

export function CoachUserMessageItem({
  messageId,
  text,
  isEditing,
  isStreaming,
  isMutating,
  onStartEdit,
  onCancelEdit,
  onEditAndResend,
}: CoachUserMessageItemProps) {
  return (
    <MessageScrollerItem messageId={messageId} scrollAnchor>
      <Message
        align="end"
        data-testid="coach-message-user"
        className="group/user-msg"
      >
        <MessageContent className={isEditing ? "w-full max-w-xl" : undefined}>
          {isEditing ? (
            <UserMessageEditor
              messageId={messageId}
              initialText={text}
              isMutating={isMutating}
              onCancelEdit={onCancelEdit}
              onEditAndResend={onEditAndResend}
            />
          ) : (
            <div className="flex items-center justify-end gap-1.5">
              {!isStreaming && !isMutating && onStartEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onStartEdit}
                  aria-label="Edit message"
                  data-testid="coach-edit-message-button"
                  className="shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-focus-within/user-msg:opacity-100 sm:group-hover/user-msg:opacity-100"
                >
                  <Pencil aria-hidden="true" className="size-3" />
                </Button>
              ) : null}
              <Bubble variant="secondary" align="end">
                <BubbleContent className="whitespace-pre-wrap">
                  {text}
                </BubbleContent>
              </Bubble>
            </div>
          )}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}
