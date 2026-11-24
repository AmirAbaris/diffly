"use client"

import * as React from "react"
import {
  CoachChallengeConfigFooter,
  CoachChallengeConfigHeader,
  CoachChallengeConfigStatus,
} from "@/components/coach/coach-challenge-config-chrome"
import {
  ChallengeConfigFields,
  CUSTOM_TOPIC_VALUE,
} from "@/components/coach/coach-challenge-config-fields"
import { CoachChallengeConfigResolved } from "@/components/coach/coach-challenge-config-resolved"
import type { CoachChallengeToolController } from "@/components/coach/use-coach-challenge-tool"
import { Card, CardContent } from "@/components/ui/card"
import {
  getTopicsForLanguage,
  normalizeConfigureChallengeInput,
  type ConfigureChallengeInput,
  type ConfigureChallengeOutput,
  type NormalizedChallengeConfigInput,
  type WizardStep,
} from "@/lib/ai/coach"
import type { Difficulty, Language } from "@/types/challenge"

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

function deriveWizardView(params: {
  normalized: NormalizedChallengeConfigInput
  step: WizardStep
  language: Language | null
  difficulty: Difficulty | null
  selectedTopicOption: string
  customTopic: string
  hasController: boolean
  isGenerating: boolean
  isQuotaFull: boolean
}) {
  const availableTopics = params.language
    ? getTopicsForLanguage(params.normalized, params.language)
    : params.normalized.suggestedTopics

  const matchesAvailable = availableTopics.some(
    (item) => item.topic === params.selectedTopicOption
  )
  const effectiveTopicOption =
    params.selectedTopicOption === CUSTOM_TOPIC_VALUE || matchesAvailable
      ? params.selectedTopicOption
      : (availableTopics[0]?.topic ?? CUSTOM_TOPIC_VALUE)

  const resolvedTopic = (
    effectiveTopicOption === CUSTOM_TOPIC_VALUE
      ? params.customTopic
      : effectiveTopicOption
  ).trim()

  const canAdvance =
    (params.step === "language" && params.language !== null) ||
    (params.step === "difficulty" && params.difficulty !== null)

  const canSubmit =
    params.hasController &&
    !params.isGenerating &&
    !params.isQuotaFull &&
    params.language !== null &&
    params.difficulty !== null &&
    resolvedTopic.length >= 3 &&
    resolvedTopic.length <= 200

  return {
    availableTopics,
    effectiveTopicOption,
    resolvedTopic,
    canAdvance,
    canSubmit,
  }
}

const IDLE_STATUS = { kind: "idle" as const }

export function CoachChallengeConfigCard({
  part,
  controller,
}: CoachChallengeConfigCardProps) {
  const normalized = React.useMemo(
    () => normalizeConfigureChallengeInput(part.input),
    [part.input]
  )

  const [step, setStep] = React.useState<WizardStep>("language")
  const [language, setLanguage] = React.useState<Language | null>(null)
  const [difficulty, setDifficulty] = React.useState<Difficulty | null>(null)
  const [selectedTopicOption, setSelectedTopicOption] = React.useState<string>(
    () => normalized.suggestedTopics[0]?.topic ?? CUSTOM_TOPIC_VALUE
  )
  const [customTopic, setCustomTopic] = React.useState("")

  if (part.state === "output-available" && part.output) {
    return <CoachChallengeConfigResolved output={part.output} />
  }

  const callStatus = controller?.getCallStatus(part.toolCallId) ?? IDLE_STATUS
  const isGenerating = callStatus.kind === "generating"
  const quota = controller?.quota
  const isQuotaFull = quota?.isQuotaFull ?? false

  const view = deriveWizardView({
    normalized,
    step,
    language,
    difficulty,
    selectedTopicOption,
    customTopic,
    hasController: Boolean(controller),
    isGenerating,
    isQuotaFull,
  })

  const handleSelectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setStep("difficulty")
  }

  const handleSelectDifficulty = (nextDifficulty: Difficulty) => {
    setDifficulty(nextDifficulty)
    setStep("topic")
  }

  const handleBack = () => {
    setStep((prev) => (prev === "topic" ? "difficulty" : "language"))
  }

  const handleNext = () => {
    setStep((prev) => (prev === "language" ? "difficulty" : "topic"))
  }

  const handleSubmit = () => {
    if (!view.canSubmit || !controller || !language || !difficulty) return
    void controller.submitConfig(part.toolCallId, {
      language,
      difficulty,
      topic: view.resolvedTopic,
    })
  }

  return (
    <Card
      size="sm"
      data-testid="coach-challenge-config-card"
      className="border-border bg-card shadow-none"
    >
      <CoachChallengeConfigHeader
        prompt={normalized.prompt}
        step={step}
        language={language}
        difficulty={difficulty}
        disabled={isGenerating}
        onJumpToStep={setStep}
      />

      <CardContent className="flex flex-col gap-3.5 text-xs">
        <ChallengeConfigFields
          step={step}
          language={language}
          difficulty={difficulty}
          recommendedLanguage={normalized.recommended.language}
          recommendedDifficulty={normalized.recommended.difficulty}
          selectedTopicOption={view.effectiveTopicOption}
          customTopic={customTopic}
          availableTopics={view.availableTopics}
          disabled={isGenerating}
          onSelectLanguage={handleSelectLanguage}
          onSelectDifficulty={handleSelectDifficulty}
          onTopicOptionChange={setSelectedTopicOption}
          onCustomTopicChange={setCustomTopic}
        />

        <CoachChallengeConfigStatus quota={quota} callStatus={callStatus} />
      </CardContent>

      <CoachChallengeConfigFooter
        step={step}
        canGoBack={step !== "language"}
        canAdvance={view.canAdvance}
        canSubmit={view.canSubmit}
        isGenerating={isGenerating}
        isQuotaFull={isQuotaFull}
        isError={callStatus.kind === "error"}
        hasController={Boolean(controller)}
        onBack={handleBack}
        onNext={handleNext}
        onCancel={() => controller?.cancelConfig(part.toolCallId)}
        onDismissQuota={() => controller?.reportQuotaFull(part.toolCallId)}
        onSubmit={handleSubmit}
      />
    </Card>
  )
}
