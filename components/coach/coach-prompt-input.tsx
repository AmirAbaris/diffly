"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUp, RotateCcw, Settings, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export interface CoachPromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  isStreaming: boolean
  connectionSummary: string | null
  placeholder?: string
  hasMessages?: boolean
  onReset?: () => void
}

export function CoachPromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  connectionSummary,
  placeholder = "Ask Agent Coach anything about your reviews…",
  hasMessages = false,
  onReset,
}: CoachPromptInputProps) {
  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isStreaming || value.trim().length === 0) return
    onSubmit()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!isStreaming && value.trim().length > 0) {
        onSubmit()
      }
    }
  }

  return (
    <form onSubmit={handleFormSubmit} data-testid="coach-prompt-input">
      <InputGroup className="rounded-2xl bg-card shadow-xs">
        <InputGroupTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Ask Agent Coach"
          disabled={isStreaming}
          rows={1}
          data-testid="coach-composer-input"
          className="max-h-40 min-h-11 px-4 pt-3 pb-1 text-sm"
        />

        <InputGroupAddon
          align="block-end"
          className="justify-between gap-2 px-3 pt-1 pb-2.5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {connectionSummary ? (
              <Badge
                variant="success"
                size="sm"
                data-testid="coach-connected-badge"
                className="max-w-full truncate font-mono"
              >
                Connected: {connectionSummary}
              </Badge>
            ) : null}
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Settings aria-hidden="true" className="size-3.5" />
              <span>Settings</span>
            </Link>
            {hasMessages && onReset ? (
              <InputGroupButton
                type="button"
                variant="ghost"
                size="xs"
                onClick={onReset}
                data-testid="coach-reset-button"
              >
                <RotateCcw aria-hidden="true" />
                <span>Reset</span>
              </InputGroupButton>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isStreaming ? (
              <InputGroupButton
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={onStop}
                aria-label="Stop generating"
                data-testid="coach-stop-button"
                className="rounded-xl"
              >
                <Square aria-hidden="true" className="size-3.5 fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                disabled={value.trim().length === 0}
                aria-label="Send message"
                data-testid="coach-send-button"
                className="rounded-xl"
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
