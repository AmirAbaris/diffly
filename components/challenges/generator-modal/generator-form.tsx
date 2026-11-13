"use client"

import * as React from "react"
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Loader2,
} from "lucide-react"
import { GeneratorLoadingPhase } from "@/components/challenges/generator-modal/generator-loading-phase"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/hooks/use-custom-challenges"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

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
] as const

function QuotaLimitBanner({ onManage }: { onManage: () => void }) {
  return (
    <div
      role="alert"
      data-testid="quota-limit-banner"
      className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="font-medium text-foreground tabular-nums">
          Quota limit reached (5/5)
        </span>
        <p className="leading-relaxed text-muted-foreground">
          You have reached your limit of 5 custom challenges. Please delete a
          challenge from your custom library to create a new one.
        </p>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-0.5 self-start"
          onClick={onManage}
          data-testid="quota-manage-btn"
        >
          Manage Custom Challenges
        </Button>
      </div>
    </div>
  )
}

interface GeminiKeyFieldProps {
  apiKey: string
  onApiKeyChange: (val: string) => void
  rememberKey: boolean
  onRememberKeyChange: (val: boolean) => void
  disabled: boolean
}

function GeminiKeyField({
  apiKey,
  onApiKeyChange,
  rememberKey,
  onRememberKeyChange,
  disabled,
}: GeminiKeyFieldProps) {
  const [showApiKey, setShowApiKey] = React.useState(false)
  const VisibilityIcon = showApiKey ? EyeOff : Eye

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="gemini-api-key"
          className="flex items-center gap-1.5 font-medium text-foreground"
        >
          <Key aria-hidden="true" className="size-3.5" />
          <span>Google Gemini API Key</span>
        </label>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground hover:underline"
          data-testid="get-gemini-key-link"
        >
          <span>Get a free key</span>
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </div>

      <InputGroup>
        <InputGroupInput
          id="gemini-api-key"
          name="geminiApiKey"
          type={showApiKey ? "text" : "password"}
          placeholder="AIzaSy…"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          data-testid="generator-api-key-input"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            disabled={disabled}
            onClick={() => setShowApiKey(!showApiKey)}
            aria-label={showApiKey ? "Hide API key" : "Show API key"}
          >
            <VisibilityIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <label
        htmlFor="remember-key-checkbox"
        className="flex cursor-pointer items-center gap-2 pt-0.5 text-muted-foreground select-none"
      >
        <input
          id="remember-key-checkbox"
          type="checkbox"
          checked={rememberKey}
          onChange={(e) => onRememberKeyChange(e.target.checked)}
          disabled={disabled}
          className="size-3.5 rounded border-border accent-primary"
          data-testid="remember-key-checkbox"
        />
        <span>Remember key in browser storage</span>
      </label>

      <p className="leading-relaxed text-muted-foreground">
        Your key is stored only in your browser&apos;s local storage and is sent
        securely to generate your challenge. It is never logged or stored on our
        servers.
      </p>
    </div>
  )
}

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
  const [rememberKey, setRememberKey] = React.useState(true)

  const isDisabled = isGenerating || isQuotaFull
  const isFormValid = topic.trim().length >= 3 && apiKey.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled || !isFormValid) return

    setStoredGeminiKey(apiKey, rememberKey)
    await onSubmit({
      topic: topic.trim(),
      language,
      difficulty,
      apiKey: apiKey.trim(),
      rememberKey,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 text-xs"
      data-testid="generator-form"
    >
      {isQuotaFull && <QuotaLimitBanner onManage={onSwitchToManage} />}

      {errorMessage && (
        <div
          role="alert"
          data-testid="generator-error-banner"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive"
        >
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="challenge-topic"
          className="flex items-center justify-between font-medium text-foreground"
        >
          <span>Topic / Vulnerability Scenario</span>
          <span className="text-muted-foreground">Min 3 characters</span>
        </label>
        <Input
          id="challenge-topic"
          name="topic"
          autoComplete="off"
          placeholder="e.g. FastAPI JWT authentication bypass, Next.js CSRF…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={isDisabled}
          required
          aria-describedby="topic-suggestions"
          data-testid="generator-topic-input"
        />

        <div
          id="topic-suggestions"
          className="flex flex-wrap items-center gap-1.5 pt-0.5"
        >
          <span className="text-muted-foreground">Try:</span>
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={isDisabled}
              onClick={() => setTopic(example)}
              className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

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
            disabled={isDisabled}
          >
            <SelectTrigger
              id="challenge-language"
              aria-label="Select programming language"
              data-testid="generator-language-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {CHALLENGE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectGroup>
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
            spacing={1}
            value={difficulty}
            onValueChange={(val) => val && setDifficulty(val as Difficulty)}
            disabled={isDisabled}
            aria-labelledby="challenge-difficulty-label"
            className="justify-start"
            data-testid="generator-difficulty-toggle"
          >
            {CHALLENGE_DIFFICULTIES.map((diff) => (
              <ToggleGroupItem key={diff} value={diff}>
                {diff}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <GeminiKeyField
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        rememberKey={rememberKey}
        onRememberKeyChange={setRememberKey}
        disabled={isDisabled}
      />

      {isGenerating && <GeneratorLoadingPhase />}

      <Button
        type="submit"
        disabled={!isFormValid || isDisabled}
        className="w-full"
        data-testid="generate-challenge-submit-btn"
      >
        {isGenerating && (
          <Loader2
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin motion-reduce:animate-none"
          />
        )}
        <span>
          {isGenerating ? "Generating challenge…" : "Generate Challenge"}
        </span>
      </Button>
    </form>
  )
}
