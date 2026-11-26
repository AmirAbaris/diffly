"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ConfigureChallengeTopicOption, WizardStep } from "@/lib/ai/coach"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

export const CUSTOM_TOPIC_VALUE = "__custom__"

export interface ChallengeConfigFieldsProps {
  step: WizardStep
  language: Language | null
  difficulty: Difficulty | null
  recommendedLanguage?: Language
  recommendedDifficulty?: Difficulty
  selectedTopicOption: string
  customTopic: string
  availableTopics: readonly ConfigureChallengeTopicOption[]
  disabled: boolean
  onSelectLanguage: (value: Language) => void
  onSelectDifficulty: (value: Difficulty) => void
  onTopicOptionChange: (value: string) => void
  onCustomTopicChange: (value: string) => void
}

export function ChallengeConfigFields({
  step,
  language,
  difficulty,
  recommendedLanguage,
  recommendedDifficulty,
  selectedTopicOption,
  customTopic,
  availableTopics,
  disabled,
  onSelectLanguage,
  onSelectDifficulty,
  onTopicOptionChange,
  onCustomTopicChange,
}: ChallengeConfigFieldsProps) {
  const headingId = React.useId()
  const customTopicId = React.useId()

  if (step === "language") {
    return (
      <div className="flex flex-col gap-2">
        <span id={headingId} className="font-medium text-foreground">
          Select a programming language
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={language ?? ""}
          onValueChange={(val) => {
            if (val) onSelectLanguage(val as Language)
            else if (language) onSelectLanguage(language)
          }}
          disabled={disabled}
          aria-labelledby={headingId}
          className="flex-wrap justify-start"
          data-testid="coach-config-language-group"
        >
          {CHALLENGE_LANGUAGES.map((lang) => {
            const isSuggested = recommendedLanguage === lang.value
            return (
              <ToggleGroupItem
                key={lang.value}
                value={lang.value}
                aria-label={lang.label}
              >
                <span>{lang.label}</span>
                {isSuggested ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    · Suggested
                  </span>
                ) : null}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
    )
  }

  if (step === "difficulty") {
    return (
      <div className="flex flex-col gap-2">
        <span id={headingId} className="font-medium text-foreground">
          Select difficulty
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={difficulty ?? ""}
          onValueChange={(val) => {
            if (val) onSelectDifficulty(val as Difficulty)
            else if (difficulty) onSelectDifficulty(difficulty)
          }}
          disabled={disabled}
          aria-labelledby={headingId}
          className="flex-wrap justify-start"
          data-testid="coach-config-difficulty-group"
        >
          {CHALLENGE_DIFFICULTIES.map((diff) => {
            const isSuggested = recommendedDifficulty === diff
            return (
              <ToggleGroupItem key={diff} value={diff} aria-label={diff}>
                <span>{diff}</span>
                {isSuggested ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    · Suggested
                  </span>
                ) : null}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
    )
  }

  const isCustomTopic = selectedTopicOption === CUSTOM_TOPIC_VALUE
  const activeSuggestion = availableTopics.find(
    (item) => item.topic === selectedTopicOption
  )

  return (
    <div className="flex flex-col gap-2">
      <span id={headingId} className="font-medium text-foreground">
        Choose a focus topic or enter your own
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        value={selectedTopicOption}
        onValueChange={(val) => {
          if (val) onTopicOptionChange(val)
        }}
        disabled={disabled}
        aria-labelledby={headingId}
        className="flex-wrap justify-start"
        data-testid="coach-config-topic-group"
      >
        {availableTopics.map((item) => (
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
          onChange={(e) => onCustomTopicChange(e.target.value)}
          placeholder="Describe the bug, pattern, or challenge name…"
          aria-label="Custom focus topic"
          minLength={3}
          maxLength={200}
          disabled={disabled}
          data-testid="coach-config-custom-topic-input"
        />
      ) : null}
    </div>
  )
}
