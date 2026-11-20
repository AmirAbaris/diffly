"use client"

import * as React from "react"
import { Key, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  GEMINI_API_KEY_STORAGE_KEY,
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/hooks/use-custom-challenges"
import { toast } from "@/hooks/use-toast"

const GEMINI_KEY_CHANGE_EVENT = "diffly:gemini-key-change"

function subscribeGeminiKey(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === GEMINI_API_KEY_STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(GEMINI_KEY_CHANGE_EVENT, callback)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(GEMINI_KEY_CHANGE_EVENT, callback)
  }
}

function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return "••••••••"
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

export function SettingsGeminiCard() {
  const storedGeminiKey = React.useSyncExternalStore(
    subscribeGeminiKey,
    getStoredGeminiKey,
    () => ""
  )
  const [geminiInput, setGeminiInput] = React.useState("")

  const handleSaveGeminiKey = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = geminiInput.trim()
    if (!trimmed) {
      return
    }
    setStoredGeminiKey(trimmed, true)
    window.dispatchEvent(new Event(GEMINI_KEY_CHANGE_EVENT))
    setGeminiInput("")
    toast({
      title: "Gemini API key saved",
      description: `Stored locally under ${GEMINI_API_KEY_STORAGE_KEY}.`,
      variant: "success",
    })
  }

  const handleClearGeminiKey = () => {
    setStoredGeminiKey("", false)
    window.dispatchEvent(new Event(GEMINI_KEY_CHANGE_EVENT))
    setGeminiInput("")
    toast({
      title: "Gemini API key cleared",
      description: "Removed saved Gemini API key from this browser.",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>Gemini API Key</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Stored only in this browser&apos;s localStorage for generating custom
          AI challenges.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              Browser Key Status:
            </span>
            {storedGeminiKey ? (
              <Badge
                variant="success"
                data-testid="gemini-key-status"
                className="font-mono"
              >
                Stored ({maskApiKey(storedGeminiKey)})
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="gemini-key-status">
                Not stored
              </Badge>
            )}
          </div>

          {storedGeminiKey && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClearGeminiKey}
              data-testid="clear-gemini-key-button"
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              <span>Clear Key</span>
            </Button>
          )}
        </div>

        <form
          onSubmit={handleSaveGeminiKey}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            type="password"
            value={geminiInput}
            onChange={(e) => setGeminiInput(e.target.value)}
            placeholder="AIzaSy… (save new key to localStorage)"
            aria-label="Gemini API Key"
            autoComplete="off"
            spellCheck={false}
            className="max-w-sm"
            data-testid="settings-gemini-key-input"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!geminiInput.trim()}
          >
            Save Key
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
