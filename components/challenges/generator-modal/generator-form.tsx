"use client"

import * as React from "react"
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/hooks/use-custom-challenges"
import type { Difficulty, Language } from "@/types/challenge"

export interface GeneratorFormValues {
  topic: string
  language: Language
  difficulty: Difficulty
  apiKey: string
  rememberKey: boolean
}

export interface GeneratorFormProps {
  isQuotaFull: boolean
  isGenerating: boolean
  errorMessage: string | null
  onSubmit: (values: GeneratorFormValues) => Promise<void>
  onSwitchToManage: () => void
}

const EXAMPLE_TOPICS = [
  "FastAPI JWT authentication bypass",
  "Next.js Server Actions CSRF",
  "Go mutex deadlock in concurrent cache",
  "Rust memory safety in unsafe block",
]

export function GeneratorForm({
  isQuotaFull,
  isGenerating,
  errorMessage,
  onSubmit,
  onSwitchToManage,
}: GeneratorFormProps) {
  const [topic, setTopic] = React.useState("")
  const [language, setLanguage] = React.useState<Language>("python")
  const [difficulty, setDifficulty] = React.useState<Difficulty>("Medium")
  const [apiKey, setApiKey] = React.useState(() => getStoredGeminiKey())
  const [rememberKey, setRememberKey] = React.useState<boolean>(true)
  const [showApiKey, setShowApiKey] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isQuotaFull || isGenerating || !topic.trim() || !apiKey.trim()) {
      return
    }

    setStoredGeminiKey(apiKey, rememberKey)
    await onSubmit({
      topic: topic.trim(),
      language,
      difficulty,
      apiKey: apiKey.trim(),
      rememberKey,
    })
  }

  const isFormValid = topic.trim().length >= 3 && apiKey.trim().length > 0

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 text-xs"
      data-testid="generator-form"
    >
      {/* Quota limit warning banner */}
      {isQuotaFull && (
        <div
          role="alert"
          data-testid="quota-limit-banner"
          className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-2.5 rounded-lg border p-3"
        >
          <AlertTriangle
            aria-hidden="true"
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">
              Quota limit reached (5/5)
            </span>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              You have reached your limit of 5 custom challenges. Please delete
              a challenge from your custom library to create a new one.
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mt-0.5 self-start"
              onClick={onSwitchToManage}
              data-testid="quota-manage-btn"
            >
              Manage Custom Challenges
            </Button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div
          role="alert"
          data-testid="generator-error-banner"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Topic input */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="challenge-topic"
          className="flex items-center justify-between font-medium text-foreground"
        >
          <span>Topic / Vulnerability Scenario</span>
          <span className="text-[11px] text-muted-foreground">
            Min 3 characters
          </span>
        </label>
        <Input
          id="challenge-topic"
          name="topic"
          placeholder="e.g. FastAPI JWT authentication bypass, Next.js CSRF..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={isGenerating || isQuotaFull}
          required
          aria-describedby="topic-suggestions"
          data-testid="generator-topic-input"
        />

        {/* Suggestion chips */}
        <div
          id="topic-suggestions"
          className="flex flex-wrap items-center gap-1.5 pt-0.5"
        >
          <span className="text-[10px] text-muted-foreground">Try:</span>
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={isGenerating || isQuotaFull}
              onClick={() => setTopic(example)}
              className="rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Language and Difficulty controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="challenge-language"
            className="font-medium text-foreground"
          >
            Language
          </label>
          <Select
            value={language}
            onValueChange={(val) => setLanguage(val as Language)}
            disabled={isGenerating || isQuotaFull}
          >
            <SelectTrigger
              id="challenge-language"
              aria-label="Select programming language"
              data-testid="generator-language-select"
            >
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="go">Go</SelectItem>
              <SelectItem value="rust">Rust</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span
            id="challenge-difficulty-label"
            className="font-medium text-foreground"
          >
            Difficulty
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={difficulty}
            onValueChange={(val) => {
              if (val) setDifficulty(val as Difficulty)
            }}
            disabled={isGenerating || isQuotaFull}
            aria-labelledby="challenge-difficulty-label"
            className="justify-start"
            data-testid="generator-difficulty-toggle"
          >
            <ToggleGroupItem value="Easy">Easy</ToggleGroupItem>
            <ToggleGroupItem value="Medium">Medium</ToggleGroupItem>
            <ToggleGroupItem value="Hard">Hard</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Gemini API Key input & BYOK info */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/40 p-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="gemini-api-key"
            className="flex items-center gap-1.5 font-medium text-foreground"
          >
            <Key aria-hidden="true" className="size-3.5 text-primary" />
            <span>Google Gemini API Key</span>
          </label>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            data-testid="get-gemini-key-link"
          >
            Get a free key
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </div>

        <InputGroup>
          <InputGroupInput
            id="gemini-api-key"
            name="geminiApiKey"
            type={showApiKey ? "text" : "password"}
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isGenerating || isQuotaFull}
            autoComplete="off"
            spellCheck={false}
            data-testid="generator-api-key-input"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              onClick={() => setShowApiKey(!showApiKey)}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeOff aria-hidden="true" className="size-3.5" />
              ) : (
                <Eye aria-hidden="true" className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <div className="flex items-center justify-between pt-1">
          <label
            htmlFor="remember-key-checkbox"
            className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground select-none"
          >
            <input
              id="remember-key-checkbox"
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => setRememberKey(e.target.checked)}
              disabled={isGenerating || isQuotaFull}
              className="size-3.5 rounded border-border text-primary accent-primary"
              data-testid="remember-key-checkbox"
            />
            <span>Remember key in browser storage</span>
          </label>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          🔒 Your key is stored only in your browser&apos;s local storage and is
          sent securely to generate your challenge. It is never logged or stored
          on our servers.
        </p>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={!isFormValid || isGenerating || isQuotaFull}
        className="mt-1 w-full"
        data-testid="generate-challenge-submit-btn"
      >
        <Sparkles aria-hidden="true" className="mr-2 size-4" />
        Generate Challenge
      </Button>
    </form>
  )
}
