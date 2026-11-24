"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ConfigureChallengeTopicOption } from "@/lib/ai/coach"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

export const CUSTOM_TOPIC_VALUE = "__custom__"

export interface ChallengeConfigFieldsProps {
  needsLanguage: boolean
  needsDifficulty: boolean
  needsTopic: boolean
  language: Language
  difficulty: Difficulty
  selectedTopicOption: string
  customTopic: string
  suggestedTopics: readonly ConfigureChallengeTopicOption[]
  disabled: boolean
  onLanguageChange: (value: Language) => void
  onDifficultyChange: (value: Difficulty) => void
  onTopicOptionChange: (value: string) => void
  onCustomTopicChange: (value: string) => void
}

export function ChallengeConfigFields({
  needsLanguage,
  needsDifficulty,
  needsTopic,
  language,
  difficulty,
  selectedTopicOption,
  customTopic,
  suggestedTopics,
  disabled,
  onLanguageChange,
  onDifficultyChange,
  onTopicOptionChange,
  onCustomTopicChange,
}: ChallengeConfigFieldsProps) {
  const languageLabelId = React.useId()
  const difficultyLabelId = React.useId()
  const topicLabelId = React.useId()
  const customTopicId = React.useId()

  const isCustomTopic = needsTopic && selectedTopicOption === CUSTOM_TOPIC_VALUE
  const activeSuggestion = needsTopic
    ? suggestedTopics.find((item) => item.topic === selectedTopicOption)
    : undefined

  return (
    <>
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
              if (val) onLanguageChange(val as Language)
            }}
            disabled={disabled}
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
          <span id={difficultyLabelId} className="font-medium text-foreground">
            Difficulty
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={difficulty}
            onValueChange={(val) => {
              if (val) onDifficultyChange(val as Difficulty)
            }}
            disabled={disabled}
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
              if (val) onTopicOptionChange(val)
            }}
            disabled={disabled}
            aria-labelledby={topicLabelId}
            className="flex-wrap justify-start"
            data-testid="coach-config-topic-group"
          >
            {suggestedTopics.map((item) => (
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
              placeholder="e.g. FastAPI JWT auth bypass, Go mutex deadlock…"
              aria-label="Custom focus topic"
              minLength={3}
              maxLength={200}
              disabled={disabled}
              data-testid="coach-config-custom-topic-input"
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}
