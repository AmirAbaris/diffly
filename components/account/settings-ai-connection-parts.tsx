"use client"

import * as React from "react"
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { UseAIConnectionResult } from "@/hooks/use-ai-connection"
import {
  formatAIConnectionSummary,
  type AIProviderCatalogEntry,
} from "@/lib/ai/catalog"

export function AIConnectionStatusHeader(props: {
  conn: UseAIConnectionResult
  isBusy: boolean
  onDisconnect: () => void
}) {
  const { conn, isBusy, onDisconnect } = props
  const summary = formatAIConnectionSummary(conn)
  const isActive = conn.isConnected && Boolean(summary)
  const suffix = conn.maskedKey ? ` · ${conn.maskedKey}` : ""
  const label = isActive ? `Connected: ${summary}${suffix}` : "Not connected"

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">Status:</span>
        <Badge
          variant={isActive ? "success" : "outline"}
          data-testid="ai-connection-status-badge"
          className="font-mono"
        >
          {label}
        </Badge>
      </div>
      {conn.isConnected ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isBusy}
          onClick={onDisconnect}
          data-testid="ai-disconnect-button"
        >
          <Trash2 data-icon="inline-start" aria-hidden="true" />
          <span>{conn.isDisconnecting ? "Disconnecting…" : "Disconnect"}</span>
        </Button>
      ) : null}
    </div>
  )
}

export function AIConnectionErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="ai-connection-error"
      className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive"
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function AIConnectionCredentialFields(props: {
  entry: AIProviderCatalogEntry
  apiKeyInput: string
  baseUrlValue: string
  showKey: boolean
  isBusy: boolean
  onApiKeyChange: (value: string) => void
  onBaseUrlChange: (value: string) => void
  onToggleShowKey: () => void
}) {
  const { entry, apiKeyInput, baseUrlValue, showKey, isBusy } = props
  const KeyIcon = showKey ? EyeOff : Eye

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="ai-api-key-input" className="font-medium">
              API Key
            </label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    data-testid="ai-api-key-encrypted-badge"
                    className="inline-flex cursor-help items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground"
                  >
                    <ShieldCheck
                      aria-hidden="true"
                      className="size-3 text-emerald-600 dark:text-emerald-400"
                    />
                    <span>Encrypted</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Sealed with AES-256-GCM in an HttpOnly cookie. Unreadable by
                  browser JavaScript.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {entry.keyPortalUrl ? (
            <a
              href={entry.keyPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="ai-key-portal-link"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              <span>{entry.keyPortalLabel}</span>
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : null}
        </div>
        <InputGroup>
          <InputGroupInput
            id="ai-api-key-input"
            type={showKey ? "text" : "password"}
            value={apiKeyInput}
            onChange={(e) => props.onApiKeyChange(e.target.value)}
            placeholder={entry.apiKeyPlaceholder}
            aria-label="API Key"
            disabled={isBusy}
            data-testid="ai-api-key-input"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              disabled={isBusy}
              onClick={props.onToggleShowKey}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              data-testid="ai-api-key-visibility-toggle"
            >
              <KeyIcon aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="ai-base-url-input"
          className="flex items-center justify-between font-medium"
        >
          <span>Base URL</span>
          <span className="text-muted-foreground">
            {entry.baseUrlRequired ? "Required" : "Optional"}
          </span>
        </label>
        <Input
          id="ai-base-url-input"
          type="url"
          value={baseUrlValue}
          onChange={(e) => props.onBaseUrlChange(e.target.value)}
          placeholder={entry.baseUrlPlaceholder}
          required={entry.baseUrlRequired}
          disabled={isBusy}
          data-testid="ai-base-url-input"
        />
      </div>
    </div>
  )
}

export function AIConnectionPrivacyFooter(props: {
  canSubmit: boolean
  isSaving: boolean
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/70 pt-3">
      <div
        data-testid="ai-privacy-notice"
        className="space-y-2 rounded-lg border border-border/70 bg-muted/25 p-3.5"
      >
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck
            aria-hidden="true"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span>
            Your API key is encrypted and never stored in our database
          </span>
        </div>
        <ul className="list-disc space-y-1 pl-4 leading-relaxed text-muted-foreground [&_code]:font-mono [&_code]:text-foreground">
          <li>
            Sealed server-side with AES-256-GCM inside an <code>HttpOnly</code>,{" "}
            <code>SameSite=Lax</code> cookie (<code>Path=/api</code>) so browser
            JavaScript cannot read it.
          </li>
          <li>
            Never written to PostgreSQL, logs, or <code>localStorage</code>, and
            stripped before backend challenge persistence.
          </li>
          <li>
            Used only to call your chosen provider from Diffly&apos;s server
            route. Click{" "}
            <strong className="font-medium text-foreground">Disconnect</strong>{" "}
            anytime to clear it immediately.
          </li>
        </ul>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={!props.canSubmit}
          className="shrink-0"
          data-testid="ai-test-save-button"
        >
          {props.isSaving ? "Testing & Saving…" : "Test & Save"}
        </Button>
      </div>
    </div>
  )
}
