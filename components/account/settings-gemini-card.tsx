"use client"

import * as React from "react"
import { Key } from "lucide-react"
import { AIProviderSelector } from "@/components/account/ai-provider-logos"
import {
  resolveAIConnectionDraft,
  toAIConnectionErrorMessage,
} from "@/components/account/settings-ai-connection-helpers"
import {
  AIConnectionCredentialFields,
  AIConnectionErrorBanner,
  AIConnectionPrivacyFooter,
  AIConnectionStatusHeader,
} from "@/components/account/settings-ai-connection-parts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { toast } from "@/hooks/use-toast"
import { AI_PROVIDER_CATALOG, type AIProviderId } from "@/lib/ai/catalog"

export function SettingsAIConnectionCard() {
  const conn = useAIConnection()
  const [draftProvider, setDraftProvider] = React.useState<AIProviderId | null>(
    null
  )
  const [draftModel, setDraftModel] = React.useState<string | null>(null)
  const [draftBaseUrl, setDraftBaseUrl] = React.useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = React.useState("")
  const [showKey, setShowKey] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const { activeProvider, entry, modelValue, baseUrlValue, hasBaseUrl } =
    resolveAIConnectionDraft(conn, draftProvider, draftModel, draftBaseUrl)
  const isBusy = conn.isSaving || conn.isDisconnecting
  const visibleError = formError ?? conn.error?.message ?? null
  const canSubmit =
    !isBusy &&
    Boolean(apiKeyInput.trim()) &&
    Boolean(modelValue.trim()) &&
    hasBaseUrl

  const resetDraft = () => {
    setDraftProvider(null)
    setDraftModel(null)
    setDraftBaseUrl(null)
  }

  const handleProviderChange = (next: AIProviderId) => {
    setFormError(null)
    if (conn.isConnected && next === conn.provider) {
      resetDraft()
      return
    }
    setDraftProvider(next)
    setDraftModel(AI_PROVIDER_CATALOG[next].defaultModel)
    setDraftBaseUrl("")
  }

  const handleModelChange = (value: string) => {
    setDraftProvider((prev) => prev ?? activeProvider)
    setDraftModel(value)
  }

  const handleBaseUrlChange = (value: string) => {
    setDraftProvider((prev) => prev ?? activeProvider)
    setDraftBaseUrl(value)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    try {
      await conn.saveConnection({
        provider: activeProvider,
        model: modelValue.trim(),
        apiKey: apiKeyInput.trim(),
        baseUrl: baseUrlValue.trim() || undefined,
      })
      setApiKeyInput("")
      resetDraft()
      toast({
        title: "AI provider connected",
        description: `Verified and sealed ${entry.label} (${modelValue.trim()}) in an HttpOnly cookie.`,
        variant: "success",
      })
    } catch (err: unknown) {
      setFormError(
        toAIConnectionErrorMessage(err, "Failed to verify AI provider.")
      )
    }
  }

  const handleDisconnect = async () => {
    setFormError(null)
    try {
      await conn.disconnect()
      resetDraft()
      toast({
        title: "AI provider disconnected",
        description: "Cleared sealed AI provider cookie from this browser.",
      })
    } catch (err: unknown) {
      setFormError(
        toAIConnectionErrorMessage(err, "Failed to disconnect AI provider.")
      )
    }
  }

  return (
    <Card data-testid="settings-ai-connection-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>AI &amp; Agent Connections</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Connect your own LLM provider (BYOK) for custom challenge generation
          and agent coaching.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-xs">
        <AIConnectionStatusHeader
          conn={conn}
          isBusy={isBusy}
          onDisconnect={handleDisconnect}
        />

        {visibleError ? (
          <AIConnectionErrorBanner message={visibleError} />
        ) : null}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-foreground">Provider</span>
            <AIProviderSelector
              value={activeProvider}
              connectedProvider={conn.isConnected ? conn.provider : null}
              disabled={isBusy}
              onChange={handleProviderChange}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ai-model-input" className="font-medium">
              Model
            </label>
            <Input
              id="ai-model-input"
              value={modelValue}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder={entry.defaultModel}
              disabled={isBusy}
              data-testid="ai-model-input"
            />
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {entry.suggestedModels.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleModelChange(s)}
                  data-testid={`ai-suggested-model-${s}`}
                  className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <AIConnectionCredentialFields
            entry={entry}
            apiKeyInput={apiKeyInput}
            baseUrlValue={baseUrlValue}
            showKey={showKey}
            isBusy={isBusy}
            onApiKeyChange={setApiKeyInput}
            onBaseUrlChange={handleBaseUrlChange}
            onToggleShowKey={() => setShowKey((prev) => !prev)}
          />

          <AIConnectionPrivacyFooter
            canSubmit={canSubmit}
            isSaving={conn.isSaving}
          />
        </form>
      </CardContent>
    </Card>
  )
}
