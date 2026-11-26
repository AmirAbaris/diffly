"use client"

import * as React from "react"
import { AlertCircle, FileCheck2, FileCode2 } from "lucide-react"
import {
  Trace,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { CoachUIMessage } from "@/lib/ai/coach"

export type SubmissionDebriefToolPart = Extract<
  CoachUIMessage["parts"][number],
  { type: "tool-get_submission_debrief" }
>

export interface CoachDebriefTraceProps {
  part: SubmissionDebriefToolPart
}

export function CoachDebriefTrace({ part }: CoachDebriefTraceProps) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <Trace data-testid="coach-debrief-loading">
        <TraceLine status="running">
          <TraceIcon>
            <FileCode2 aria-hidden="true" />
          </TraceIcon>
          <TraceTitle>Inspecting submission debrief</TraceTitle>
        </TraceLine>
      </Trace>
    )
  }

  if (part.state === "output-available") {
    return (
      <Trace data-testid="coach-debrief-complete">
        <TraceLine>
          <TraceIcon>
            <FileCheck2 aria-hidden="true" />
          </TraceIcon>
          <TraceTitle className="shrink-0">
            Reviewed submission details
          </TraceTitle>
          {part.output?.challengeTitle ? (
            <TraceDescription className="min-w-0 shrink truncate">
              {part.output.challengeTitle}
            </TraceDescription>
          ) : null}
        </TraceLine>
      </Trace>
    )
  }

  if (part.state === "output-error") {
    return (
      <Trace role="alert" data-testid="coach-debrief-error">
        <TraceLine status="error">
          <TraceIcon>
            <AlertCircle aria-hidden="true" />
          </TraceIcon>
          <TraceTitle>
            {part.errorText || "Could not inspect submission debrief"}
          </TraceTitle>
        </TraceLine>
      </Trace>
    )
  }

  return null
}
