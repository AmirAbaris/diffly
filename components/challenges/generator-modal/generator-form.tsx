"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  Key,
  Loader2,
  Settings,
} from "lucide-react"
import { GeneratorLoadingPhase } from "@/components/challenges/generator-modal/generator-loading-phase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { formatAIConnectionSummary } from "@/lib/ai/catalog"
import {
  useCustomChallengeModalStore,
  type CustomChallengePrefill,
} from "@/stores/custom-challenge-modal-store"
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
}

export interface GeneratorFormProps {
  initialValues?: CustomChallengePrefill
  isQuotaFull: boolean
  isGenerating: boolean
  errorMessage: string | null
  onSubmit: (values: GeneratorFormValues) => Promise<void>
  onSwitchToManage: () => void
  onCloseModal?: () => void
}

const EXAMPLE_TOPICS = [
  "FastAPI JWT authentication bypass",
  "Next.js Server Actions CSRF",
  "Go mutex deadlock in concurrent cache",
  "Rust memory safety in unsafe block",
  "Spring Boot SpEL injection or IDOR",
] as const

export function GeneratorForm({
  initialValues,
  isQuotaFull,
  isGenerating,
  errorMessage,
  onSubmit,
  onSwitchToManage,
  onCloseModal,
}: GeneratorFormProps) {
  const [topic, setTopic] = React.useState(initialValues?.topic ?? "")
  const [language, setLanguage] = React.useState<Language>(
    initialValues?.language ?? "python"
  )
  const [difficulty, setDifficulty] = React.useState<Difficulty>(
    initialValues?.difficulty ?? "Medium"
  )

  const storeSetIsOpen = useCustomChallengeModalStore((s) => s.setIsOpen)
  const conn = useAIConnection()
  const summary = formatAIConnectionSummary(conn)
  const isDisabled = isGenerating || isQuotaFull
  const isFormValid =
    conn.isConnected && !conn.isLoading && topic.trim().length >= 3

  const handleNavigateSettings = () => {
    storeSetIsOpen(false)
    onCloseModal?.()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled || !isFormValid) return
    await onSubmit({ topic: topic.trim(), language, difficulty })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 text-xs"
      data-testid="generator-form"
    >
      {isQuotaFull ? (
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
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          data-testid="generator-error-banner"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive"
        >
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {!conn.isLoading ? (
        conn.isConnected && summary ? (
          <div
            data-testid="generator-ai-connected-banner"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
          >
            <Badge
              variant="success"
              data-testid="generator-ai-status-pill"
              className="font-mono"
            >
              Connected: {summary}
            </Badge>
            <Link
              href="/settings"
              onClick={handleNavigateSettings}
              data-testid="generator-manage-settings-link"
              className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              <Settings aria-hidden="true" className="size-3.5" />
              <span>Manage in Settings</span>
            </Link>
          </div>
        ) : (
          <div
            data-testid="generator-ai-disconnected-cta"
            className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-2.5">
              <Key
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">
                  Connect an AI provider to generate challenges
                </span>
                <p className="leading-relaxed text-muted-foreground">
                  Configure Google Gemini, OpenAI, Anthropic, or an
                  OpenAI-compatible key once in Settings.
                </p>
              </div>
            </div>
            <Button variant="outline" size="xs" asChild className="shrink-0">
              <Link
                href="/settings"
                onClick={handleNavigateSettings}
                data-testid="generator-configure-settings-link"
              >
                <Settings data-icon="inline-start" aria-hidden="true" />
                <span>Configure in Settings</span>
              </Link>
            </Button>
          </div>
        )
      ) : (
        <Skeleton
          data-testid="generator-ai-status-skeleton"
          className="h-14 w-full rounded-lg"
        />
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
              className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="challenge-language" className="font-medium">
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
          <span id="challenge-difficulty-label" className="font-medium">
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

      {isGenerating ? <GeneratorLoadingPhase /> : null}

      <Button
        type="submit"
        disabled={!isFormValid || isDisabled}
        className="w-full"
        data-testid="generate-challenge-submit-btn"
      >
        {isGenerating ? (
          <Loader2
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : null}
        <span>
          {isGenerating ? "Generating challenge…" : "Generate Challenge"}
        </span>
      </Button>
    </form>
  )
}
