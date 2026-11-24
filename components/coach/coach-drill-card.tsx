"use client"

import * as React from "react"
import Link from "next/link"
import axios from "axios"
import { AlertCircle, ArrowRight, RotateCcw, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import {
  isRequestTimeoutError,
  useCustomChallenges,
} from "@/hooks/use-custom-challenges"
import {
  parseCoachErrorMessage,
  type TargetedDrillSuggestion,
} from "@/lib/ai/coach"
import { formatLanguageLabel } from "@/types/challenge"

type InlineDrillState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "created"; slug: string; title: string }
  | { kind: "error"; message: string }

export interface CoachDrillCardProps {
  drill: TargetedDrillSuggestion
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
}

function resolveDrillErrorMessage(err: unknown): string {
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

export function CoachDrillCard({
  drill,
  onGenerateDrill,
}: CoachDrillCardProps) {
  const [state, setState] = React.useState<InlineDrillState>({ kind: "idle" })
  const { generateCustomChallenge, isQuotaFull, quotaLimit } =
    useCustomChallenges()

  const handleGenerate = async () => {
    if (onGenerateDrill) {
      onGenerateDrill(drill)
      return
    }
    if (isQuotaFull || state.kind === "generating") return

    setState({ kind: "generating" })
    try {
      const created = await generateCustomChallenge({
        topic: drill.topic,
        language: drill.language,
        difficulty: drill.difficulty,
      })
      setState({
        kind: "created",
        slug: created.slug,
        title: created.title,
      })
    } catch (err: unknown) {
      setState({
        kind: "error",
        message: resolveDrillErrorMessage(err),
      })
    }
  }

  return (
    <Card
      data-testid="coach-drill-suggestion-card"
      className="gap-0 border-border bg-card py-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Targeted Practice Drill
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" size="sm" className="font-mono">
              {formatLanguageLabel(drill.language)}
            </Badge>
            <Badge variant="outline" size="sm">
              {drill.difficulty}
            </Badge>
          </div>
        </div>

        <p className="text-sm font-medium text-balance text-foreground">
          {drill.topic}
        </p>

        {drill.rationale ? (
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            {drill.rationale}
          </p>
        ) : null}

        {state.kind === "generating" ? (
          <div className="pt-0.5">
            <Trace data-testid="coach-drill-generating">
              <TraceLine status="running">
                <TraceIcon>
                  <Sparkles />
                </TraceIcon>
                <TraceTitle>Generating challenge</TraceTitle>
              </TraceLine>
            </Trace>
          </div>
        ) : state.kind === "created" ? (
          <div
            data-testid="coach-drill-created"
            className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="sm">
                Challenge Ready
              </Badge>
              <span className="text-xs font-medium text-foreground">
                {state.title}
              </span>
            </div>
            <div>
              <Button
                size="sm"
                asChild
                data-testid="coach-drill-open-challenge"
              >
                <Link href={`/challenges/${state.slug}`}>
                  <span>Start Review in Arena</span>
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        ) : state.kind === "error" ? (
          <div className="flex flex-col gap-2 pt-0.5">
            <Trace role="alert" data-testid="coach-drill-error">
              <TraceLine status="error">
                <TraceIcon>
                  <AlertCircle />
                </TraceIcon>
                <TraceTitle>{state.message}</TraceTitle>
              </TraceLine>
            </Trace>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!onGenerateDrill && isQuotaFull}
                onClick={() => void handleGenerate()}
                data-testid="coach-drill-retry-button"
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                <span>Try Again</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-0.5">
            <div>
              <Button
                type="button"
                size="sm"
                disabled={!onGenerateDrill && isQuotaFull}
                onClick={() => void handleGenerate()}
                data-testid="coach-generate-drill-button"
              >
                <Sparkles data-icon="inline-start" aria-hidden="true" />
                <span>Generate Targeted Drill</span>
              </Button>
            </div>
            {!onGenerateDrill && isQuotaFull ? (
              <p
                data-testid="coach-drill-quota-note"
                className="text-xs leading-relaxed text-pretty text-muted-foreground tabular-nums"
              >
                Library full ({quotaLimit}/{quotaLimit}). Delete a custom
                challenge in the sidebar to create a new one.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
