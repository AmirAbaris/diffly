"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  SquareIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  onCreateChallenge?: () => void
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
  onCreateChallenge,
}: CoachPromptInputProps) {
  const formRef = React.useRef<HTMLFormElement>(null)
  const canSend = !isStreaming && value.trim().length > 0

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSend) return
    onSubmit()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        formRef.current?.requestSubmit()
      }
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleFormSubmit}
      data-testid="coach-prompt-input"
    >
      <InputGroup className="bg-card">
        <InputGroupTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Ask Agent Coach"
          disabled={isStreaming}
          rows={1}
          data-testid="coach-composer-input"
          className="max-h-40 min-h-11 p-3 text-sm"
        />

        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="outline"
                className="rounded-full"
                aria-label="Coach actions"
                data-testid="coach-actions-menu-trigger"
              >
                <PlusIcon aria-hidden="true" />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Coach Actions</DropdownMenuLabel>
                {onCreateChallenge ? (
                  <DropdownMenuItem
                    disabled={isStreaming}
                    onClick={onCreateChallenge}
                    data-testid="coach-menu-generate-challenge"
                  >
                    <PlusIcon aria-hidden="true" />
                    <span>Generate Custom Challenge</span>
                  </DropdownMenuItem>
                ) : null}
                {hasMessages && onReset ? (
                  <DropdownMenuItem
                    onClick={onReset}
                    data-testid="coach-reset-button"
                  >
                    <RotateCcwIcon aria-hidden="true" />
                    <span>Reset Conversation</span>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon aria-hidden="true" />
                    <span>AI Provider Settings</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {connectionSummary ? (
            <InputGroupButton
              asChild
              size="sm"
              variant="outline"
              className="ml-auto max-w-[14rem] truncate font-mono text-xs"
              data-testid="coach-connected-badge"
            >
              <Link
                href="/settings"
                aria-label={`Connected model: ${connectionSummary}`}
              >
                <span className="truncate">{connectionSummary}</span>
              </Link>
            </InputGroupButton>
          ) : null}

          {isStreaming ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={onStop}
              aria-label="Stop generating"
              data-testid="coach-stop-button"
              className={
                connectionSummary ? "rounded-full" : "ml-auto rounded-full"
              }
            >
              <SquareIcon aria-hidden="true" className="size-3 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              disabled={!canSend}
              aria-label="Send message"
              data-testid="coach-send-button"
              className={
                connectionSummary ? "rounded-full" : "ml-auto rounded-full"
              }
            >
              <ArrowUpIcon aria-hidden="true" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
