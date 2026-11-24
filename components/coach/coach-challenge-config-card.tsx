"use client"

import * as React from "react"
import { AlertCircle, AlertTriangle, RotateCcw, Sparkles } from "lucide-react"
import { CoachChallengeConfigResolved } from "@/components/coach/coach-challenge-config-resolved"
import type { CoachChallengeToolController } from "@/components/coach/use-coach-challenge-tool"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import {
  normalizeConfigureChallengeInput,
  type ConfigureChallengeInput,
  type ConfigureChallengeOutput,
} from "@/lib/ai/coach"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  formatLanguageLabel,
  type Difficulty,
  type Language,
} from "@/types/challenge"

const CUSTOM_TOPIC_VALUE = "__custom__"

export interface ConfigureChallengeToolPart {
  toolCallId: string
  state: string
  input?: ConfigureChallengeInput
  output?: ConfigureChallengeOutput
}

export interface CoachChallengeConfigCardProps {
  part: ConfigureChallengeToolPart
  controller?: CoachChallengeToolController
}

export function CoachChallengeConfigCard({
  part,
  controller,
}: CoachChallengeConfigCardProps) {
  const languageLabelId = React.useId()
  const difficultyLabelId = React.useId()
  const topicLabelId = React.useId()
  const customTopicId = React.useId()

  const normalized = React.useMemo(
    () => normalizeConfigureChallengeInput(part.input),
    [part.input]
  )

  const [language, setLanguage] = React.useState<Language>(
    normalized.prefilled.language ?? "python"
  )
  const [difficulty, setDifficulty] = React.useState<Difficulty>(
    normalized.prefilled.difficulty ?? "Medium"
  )
  const [selectedTopicOption, setSelectedTopicOption] = React.useState<string>(
    () =>
      normalized.prefilled.topic ??
      normalized.suggestedTopics[0]?.topic ??
      CUSTOM_TOPIC_VALUE
  )
  const [customTopic, setCustomTopic] = React.useState("")

  if (part.state === "output-available" && part.output) {
    return <CoachChallengeConfigResolved output={part.output} />
  }

  const callStatus = controller?.getCallStatus(part.toolCallId) ?? {
    kind: "idle" as const,
  }
  const isGenerating = callStatus.kind === "generating"
  const quota = controller?.quota
  const isQuotaFull = quota?.isQuotaFull ?? false

  const needsLanguage = normalized.missingFields.includes("language")
  const needsDifficulty = normalized.missingFields.includes("difficulty")
  const needsTopic = normalized.missingFields.includes("topic")

  const resolvedLanguage = normalized.prefilled.language ?? language
  const resolvedDifficulty = normalized.prefilled.difficulty ?? difficulty
  const isCustomTopic = needsTopic && selectedTopicOption === CUSTOM_TOPIC_VALUE
  const resolvedTopic = (
    normalized.prefilled.topic ??
    (isCustomTopic ? customTopic : selectedTopicOption)
  ).trim()

  const activeSuggestion = needsTopic
    ? normalized.suggestedTopics.find(
        (item) => item.topic === selectedTopicOption
      )
    : undefined

  const canSubmit =
    Boolean(controller) &&
    !isGenerating &&
    !isQuotaFull &&
    resolvedTopic.length >= 3 &&
    resolvedTopic.length <= 200

  const handleContinue = () => {
    if (!canSubmit || !controller) return
    void controller.submitConfig(part.toolCallId, {
      language: resolvedLanguage,
      difficulty: resolvedDifficulty,
      topic: resolvedTopic,
    })
  }

  return (
    <Card
      size="sm"
      data-testid="coach-challenge-config-card"
      className="border-border bg-card shadow-none"
    >
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Custom Challenge</span>
          </div>
          {normalized.prefilled.language || normalized.prefilled.difficulty ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {normalized.prefilled.language ? (
                <Badge
                  variant="secondary"
                  size="sm"
                  data-testid="coach-config-prefilled-language"
                  className="font-mono"
                >
                  {formatLanguageLabel(normalized.prefilled.language)}
                </Badge>
              ) : null}
              {normalized.prefilled.difficulty ? (
                <Badge
                  variant="outline"
                  size="sm"
                  data-testid="coach-config-prefilled-difficulty"
                >
                  {normalized.prefilled.difficulty}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
        <CardTitle className="text-sm text-balance">
          {normalized.prompt}
        </CardTitle>
        {normalized.prefilled.topic ? (
          <CardDescription
            data-testid="coach-config-prefilled-topic"
            className="text-xs text-pretty"
          >
            Topic: {normalized.prefilled.topic}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5 text-xs">
        {isQuotaFull && quota ? (
          <div
            role="alert"
            data-testid="coach-config-quota-alert"
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <span className="leading-relaxed text-pretty tabular-nums">
              Library full ({quota.total}/{quota.quotaLimit}). Delete a custom
              challenge in the sidebar to continue.
            </span>
          </div>
        ) : null}

        {needsLanguage ? (
          <div className="flex flex-col gap-1.5">
            <span id={languageLabelId} className="font-medium text-foreground">
              Language
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={1}
              value={language}
              onValueChange={(val) => {
                if (val) setLanguage(val as Language)
              }}
              disabled={isGenerating}
              aria-labelledby={languageLabelId}
              className="flex-wrap justify-start"
              data-testid="coach-config-language-group"
            >
              {CHALLENGE_LANGUAGES.map((lang) => (
                <ToggleGroupItem key={lang.value} value={lang.value}>
                  {lang.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}

        {needsDifficulty ? (
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
              onValueChange={(val) => {
                if (val) setDifficulty(val as Difficulty)
              }}
              disabled={isGenerating}
              aria-labelledby={difficultyLabelId}
              className="flex-wrap justify-start"
              data-testid="coach-config-difficulty-group"
            >
              {CHALLENGE_DIFFICULTIES.map((diff) => (
                <ToggleGroupItem key={diff} value={diff}>
                  {diff}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}

        {needsTopic ? (
          <div className="flex flex-col gap-1.5">
            <span id={topicLabelId} className="font-medium text-foreground">
              Focus Topic
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={1}
              value={selectedTopicOption}
              onValueChange={(val) => {
                if (val) setSelectedTopicOption(val)
              }}
              disabled={isGenerating}
              aria-labelledby={topicLabelId}
              className="flex-wrap justify-start"
              data-testid="coach-config-topic-group"
            >
              {normalized.suggestedTopics.map((item) => (
                <ToggleGroupItem key={item.topic} value={item.topic}>
                  {item.label}
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem
                value={CUSTOM_TOPIC_VALUE}
                data-testid="coach-config-topic-custom-toggle"
              >
                Custom
              </ToggleGroupItem>
            </ToggleGroup>

            {activeSuggestion?.rationale ? (
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
                {activeSuggestion.rationale}
              </p>
            ) : null}

            {isCustomTopic ? (
              <Input
                id={customTopicId}
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="e.g. FastAPI JWT auth bypass, Go mutex deadlock…"
                aria-label="Custom focus topic"
                minLength={3}
                maxLength={200}
                disabled={isGenerating}
                data-testid="coach-config-custom-topic-input"
              />
            ) : null}
          </div>
        ) : null}

        {isGenerating ? (
          <Trace data-testid="coach-config-generating">
            <TraceLine status="running">
              <TraceIcon>
                <Sparkles />
              </TraceIcon>
              <TraceTitle>Generating challenge…</TraceTitle>
            </TraceLine>
          </Trace>
        ) : null}

        {callStatus.kind === "error" ? (
          <Trace role="alert" data-testid="coach-config-error">
            <TraceLine status="error">
              <TraceIcon>
                <AlertCircle />
              </TraceIcon>
              <TraceTitle>{callStatus.message}</TraceTitle>
            </TraceLine>
          </Trace>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isGenerating || !controller}
          onClick={() => controller?.cancelConfig(part.toolCallId)}
          data-testid="coach-config-cancel-button"
        >
          Cancel
        </Button>

        {isQuotaFull ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGenerating || !controller}
            onClick={() => controller?.reportQuotaFull(part.toolCallId)}
            data-testid="coach-config-quota-dismiss-button"
          >
            Dismiss (Library Full)
          </Button>
        ) : null}

        {callStatus.kind === "error" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canSubmit}
            onClick={handleContinue}
            data-testid="coach-config-retry-button"
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            <span>Try Again</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={handleContinue}
            data-testid="coach-config-continue-button"
          >
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            <span>Continue</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
