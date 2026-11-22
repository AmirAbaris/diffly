"use client"

import * as React from "react"
import { Check, Server } from "lucide-react"
import {
  AI_PROVIDER_CATALOG,
  AI_PROVIDERS,
  type AIProviderId,
} from "@/lib/ai/catalog"
import { cn } from "@/lib/utils"

export function AIProviderLogo({
  provider,
  className,
}: {
  provider: AIProviderId
  className?: string
}) {
  const shared = cn("size-4 text-foreground", className)

  if (provider === "google") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-testid="ai-provider-logo-google"
        className={shared}
      >
        <path
          d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z"
          fill="currentColor"
        />
      </svg>
    )
  }

  if (provider === "openai") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-testid="ai-provider-logo-openai"
        className={shared}
      >
        <path
          d="M12 3L19.794 7.5V16.5L12 21L4.206 16.5V7.5L12 3Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M12 7.2L16.157 9.6V14.4L12 16.8L7.843 14.4V9.6L12 7.2ZM12 3V7.2M19.794 7.5L16.157 9.6M19.794 16.5L16.157 14.4M12 21V16.8M4.206 16.5L7.843 14.4M4.206 7.5L7.843 9.6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (provider === "anthropic") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-testid="ai-provider-logo-anthropic"
        className={shared}
      >
        <path
          d="M14.1 4H16.8L22 20H19.1L14.1 4ZM7.3 4H10.2L15.4 20H12.5L11.4 16.4H6.1L5 20H2.1L7.3 4ZM6.9 13.8H10.6L8.75 7.6L6.9 13.8Z"
          fill="currentColor"
        />
      </svg>
    )
  }

  return (
    <Server
      aria-hidden="true"
      data-testid="ai-provider-logo-openai-compatible"
      className={shared}
    />
  )
}

export function AIProviderSelector(props: {
  value: AIProviderId
  connectedProvider: AIProviderId | null
  disabled?: boolean
  onChange: (provider: AIProviderId) => void
}) {
  const { value, connectedProvider, disabled = false, onChange } = props

  return (
    <div
      role="radiogroup"
      aria-label="AI Provider"
      data-testid="ai-provider-selector"
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
    >
      {AI_PROVIDERS.map((id) => {
        const entry = AI_PROVIDER_CATALOG[id]
        const isSelected = value === id
        const isConnected = connectedProvider === id

        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(id)}
            data-testid={`ai-provider-option-${entry.id}`}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? "border-foreground bg-muted/40 ring-1 ring-foreground/15"
                : "border-border/70 bg-background hover:bg-muted/30"
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                  isSelected
                    ? "border-foreground/30 bg-background"
                    : "border-border/70 bg-muted/20"
                )}
              >
                <AIProviderLogo provider={entry.id} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {entry.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.subtitle}
                </span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isConnected ? (
                <span
                  title="Connected"
                  data-testid={`ai-provider-connected-dot-${entry.id}`}
                  className="size-2 rounded-full bg-emerald-500"
                />
              ) : null}
              {isSelected ? (
                <Check
                  aria-hidden="true"
                  className="size-4 shrink-0 text-foreground"
                />
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
