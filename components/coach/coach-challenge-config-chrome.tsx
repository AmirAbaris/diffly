"use client"

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react"
import type { ChallengeToolCallStatus } from "@/components/coach/use-coach-challenge-tool"
import { Button } from "@/components/ui/button"
import { CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import type { WizardStep } from "@/lib/ai/coach"
import {
  formatLanguageLabel,
  type Difficulty,
  type Language,
} from "@/types/challenge"

const STEP_INDEX: Record<WizardStep, number> = {
  language: 1,
  difficulty: 2,
  topic: 3,
}

export interface CoachChallengeConfigHeaderProps {
  prompt: string
  step: WizardStep
  language: Language | null
  difficulty: Difficulty | null
  disabled: boolean
  onJumpToStep: (step: WizardStep) => void
}

export function CoachChallengeConfigHeader({
  prompt,
  step,
  language,
  difficulty,
  disabled,
  onJumpToStep,
}: CoachChallengeConfigHeaderProps) {
  const stepNumber = STEP_INDEX[step]
  const canOpenDifficulty = language !== null || difficulty !== null
  const canOpenTopic = language !== null && difficulty !== null

  const pills: Array<{
    id: WizardStep
    label: string
    completed: boolean
    enabled: boolean
    testId: string
  }> = [
    {
      id: "language",
      label: language
        ? `Language: ${formatLanguageLabel(language)}`
        : "1. Language",
      completed: language !== null,
      enabled: !disabled,
      testId: "coach-config-step-language",
    },
    {
      id: "difficulty",
      label: difficulty ? `Difficulty: ${difficulty}` : "2. Difficulty",
      completed: difficulty !== null,
      enabled: !disabled && canOpenDifficulty,
      testId: "coach-config-step-difficulty",
    },
    {
      id: "topic",
      label: "3. Topic",
      completed: false,
      enabled: !disabled && canOpenTopic,
      testId: "coach-config-step-topic",
    },
  ]

  return (
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
          <span>Custom Challenge</span>
        </div>
        <span
          data-testid="coach-config-step-indicator"
          className="font-mono text-xs text-muted-foreground tabular-nums"
        >
          Step {stepNumber} of 3
        </span>
      </div>
      <CardTitle className="text-sm text-balance">{prompt}</CardTitle>
      <nav
        aria-label="Challenge setup steps"
        className="flex flex-wrap items-center gap-1.5"
      >
        {pills.map((pill) => {
          const isCurrent = step === pill.id
          return (
            <Button
              key={pill.id}
              type="button"
              size="xs"
              variant={
                isCurrent ? "secondary" : pill.completed ? "outline" : "ghost"
              }
              disabled={!pill.enabled}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onJumpToStep(pill.id)}
              data-testid={pill.testId}
            >
              {pill.completed && !isCurrent ? (
                <Check data-icon="inline-start" aria-hidden="true" />
              ) : null}
              <span>{pill.label}</span>
            </Button>
          )
        })}
      </nav>
    </CardHeader>
  )
}

export interface CoachChallengeConfigStatusProps {
  quota?: {
    total: number
    quotaLimit: number
    isQuotaFull: boolean
  }
  callStatus: ChallengeToolCallStatus
}

export function CoachChallengeConfigStatus({
  quota,
  callStatus,
}: CoachChallengeConfigStatusProps) {
  return (
    <>
      {quota?.isQuotaFull ? (
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

      {callStatus.kind === "generating" ? (
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
    </>
  )
}

export interface CoachChallengeConfigFooterProps {
  step: WizardStep
  canGoBack: boolean
  canAdvance: boolean
  canSubmit: boolean
  isGenerating: boolean
  isQuotaFull: boolean
  isError: boolean
  hasController: boolean
  onBack: () => void
  onNext: () => void
  onCancel: () => void
  onDismissQuota: () => void
  onSubmit: () => void
}

export function CoachChallengeConfigFooter({
  step,
  canGoBack,
  canAdvance,
  canSubmit,
  isGenerating,
  isQuotaFull,
  isError,
  hasController,
  onBack,
  onNext,
  onCancel,
  onDismissQuota,
  onSubmit,
}: CoachChallengeConfigFooterProps) {
  return (
    <CardFooter className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {canGoBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isGenerating}
            onClick={onBack}
            data-testid="coach-config-back-button"
          >
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            <span>Back</span>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isGenerating || !hasController}
          onClick={onCancel}
          data-testid="coach-config-cancel-button"
        >
          Cancel
        </Button>

        {isQuotaFull ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGenerating || !hasController}
            onClick={onDismissQuota}
            data-testid="coach-config-quota-dismiss-button"
          >
            Dismiss (Library Full)
          </Button>
        ) : null}

        {step !== "topic" && canAdvance ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGenerating}
            onClick={onNext}
            data-testid="coach-config-next-button"
          >
            <span>Next</span>
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        ) : null}

        {step === "topic" ? (
          isError ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canSubmit}
              onClick={onSubmit}
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
              onClick={onSubmit}
              data-testid="coach-config-continue-button"
            >
              <Sparkles data-icon="inline-start" aria-hidden="true" />
              <span>Create Challenge</span>
            </Button>
          )
        ) : null}
      </div>
    </CardFooter>
  )
}
