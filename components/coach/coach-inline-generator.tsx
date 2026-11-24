"use client"

import * as React from "react"
import Link from "next/link"
import axios from "axios"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import {
  isRequestTimeoutError,
  useCustomChallenges,
} from "@/hooks/use-custom-challenges"
import { parseCoachErrorMessage } from "@/lib/ai/coach"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

type InlineGeneratorState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "created"; slug: string; title: string }
  | { kind: "error"; message: string }

export interface CoachInlineGeneratorProps {
  onClose: () => void
}

function resolveGeneratorErrorMessage(err: unknown): string {
  if (isRequestTimeoutError(err)) {
    return "Generation timed out. Check your custom library in the sidebar in case it finished."
  }
  if (axios.isAxiosError(err)) {
    const fromData = parseCoachErrorMessage(err.response?.data, "")
    if (fromData) return fromData
    if (err.response?.status === 401) {
      return "AI provider authentication failed. Check your API key in Settings."
    }
    if (err.response?.status === 429) {
      return "AI provider rate limit reached. Please wait a moment and try again."
    }
    if (err.response?.status === 400) {
      return "Quota limit reached. Delete a custom challenge in the sidebar first."
    }
  }
  return parseCoachErrorMessage(
    err,
    "Failed to generate challenge. Please try again."
  )
}

export function CoachInlineGenerator({ onClose }: CoachInlineGeneratorProps) {
  const topicId = React.useId()
  const languageId = React.useId()
  const difficultyLabelId = React.useId()

  const [topic, setTopic] = React.useState("")
  const [language, setLanguage] = React.useState<Language>("python")
  const [difficulty, setDifficulty] = React.useState<Difficulty>("Medium")
  const [state, setState] = React.useState<InlineGeneratorState>({
    kind: "idle",
  })

  const { generateCustomChallenge, isQuotaFull, quotaLimit } =
    useCustomChallenges()

  const isGenerating = state.kind === "generating"
  const isDisabled = isGenerating || isQuotaFull
  const canSubmit = !isDisabled && topic.trim().length >= 3

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setState({ kind: "generating" })
    try {
      const created = await generateCustomChallenge({
        topic: topic.trim(),
        language,
        difficulty,
      })
      setState({
        kind: "created",
        slug: created.slug,
        title: created.title,
      })
    } catch (err: unknown) {
      setState({
        kind: "error",
        message: resolveGeneratorErrorMessage(err),
      })
    }
  }

  const handleCreateAnother = () => {
    setTopic("")
    setState({ kind: "idle" })
  }

  return (
    <Card
      data-testid="coach-inline-generator"
      className="gap-0 border-border bg-card py-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-3.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Generate Custom Challenge
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close challenge generator"
            data-testid="coach-inline-generator-close"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        {state.kind === "created" ? (
          <div
            data-testid="coach-inline-created"
            className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="sm">
                Challenge Ready
              </Badge>
              <span className="text-sm font-medium text-foreground">
                {state.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                asChild
                data-testid="coach-inline-open-challenge"
              >
                <Link href={`/challenges/${state.slug}`}>
                  <span>Start Review in Arena</span>
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCreateAnother}
                data-testid="coach-inline-create-another"
              >
                Create another
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-3 text-xs"
          >
            {isQuotaFull ? (
              <div
                role="alert"
                data-testid="coach-inline-quota-alert"
                className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <span className="leading-relaxed text-pretty tabular-nums">
                  Library full ({quotaLimit}/{quotaLimit}). Delete a custom
                  challenge in the sidebar to create a new one.
                </span>
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div
                role="alert"
                data-testid="coach-inline-error-alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={topicId}
                className="flex items-center justify-between font-medium text-foreground"
              >
                <span>Topic</span>
                <span className="font-normal text-muted-foreground">
                  Min 3 characters
                </span>
              </label>
              <Input
                id={topicId}
                name="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. FastAPI JWT auth bypass, Go mutex deadlock…"
                disabled={isDisabled}
                required
                minLength={3}
                data-testid="coach-inline-topic-input"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={languageId}
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
                    id={languageId}
                    aria-label="Select programming language"
                    size="sm"
                    className="w-full"
                    data-testid="coach-inline-language-select"
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
                  id={difficultyLabelId}
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
                  onValueChange={(val) =>
                    val && setDifficulty(val as Difficulty)
                  }
                  disabled={isDisabled}
                  aria-labelledby={difficultyLabelId}
                  className="justify-start"
                  data-testid="coach-inline-difficulty-toggle"
                >
                  {CHALLENGE_DIFFICULTIES.map((diff) => (
                    <ToggleGroupItem key={diff} value={diff}>
                      {diff}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            {isGenerating ? (
              <Trace data-testid="coach-inline-generating">
                <TraceLine status="running">
                  <TraceIcon>
                    <Sparkles />
                  </TraceIcon>
                  <TraceTitle>Generating challenge</TraceTitle>
                </TraceLine>
              </Trace>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit}
                data-testid="coach-inline-submit-button"
              >
                <Sparkles data-icon="inline-start" aria-hidden="true" />
                <span>Generate Challenge</span>
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
