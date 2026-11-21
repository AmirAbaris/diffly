"use client"

import * as React from "react"
import { AnnotationProvider } from "@/components/review/annotations/annotation-layer"
import { useVerdictAnnotationLayer } from "@/components/review/annotations/use-verdict-annotation-layer"
import { CodeViewer } from "@/components/review/code-viewer"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import type { GradeReport } from "@/lib/review"
import type {
  ChallengeFile,
  ChallengeSolutionResponse,
} from "@/types/challenge"

export interface AnnotatedCodeTabProps {
  codeSnippet?: string
  files?: ChallengeFile[]
  language?: string
  gradeReport?: GradeReport | null
  solution?: ChallengeSolutionResponse | null
}

export function AnnotatedCodeTab({
  codeSnippet,
  files,
  language = "python",
  gradeReport = null,
  solution = null,
}: AnnotatedCodeTabProps) {
  const verdictLayer = useVerdictAnnotationLayer({
    report: gradeReport,
    solution,
  })

  const hasCode = Boolean(codeSnippet) || Boolean(files && files.length > 0)

  if (!hasCode) {
    return (
      <Empty className="border border-dashed border-border bg-muted/20">
        <EmptyHeader>
          <EmptyTitle>No source code available</EmptyTitle>
          <EmptyDescription>
            Annotated verdict overlay requires challenge source code or patch
            files.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div data-testid="annotated-code-tab" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Verdict key:</span>
        <Badge variant="success" size="sm">
          Matched
        </Badge>
        <Badge variant="warning" size="sm">
          Missed
        </Badge>
        <Badge variant="destructive" size="sm">
          False positive
        </Badge>
        <Badge variant="secondary" size="sm">
          Redundant
        </Badge>
      </div>

      <AnnotationProvider layer={verdictLayer}>
        <CodeViewer
          code={codeSnippet}
          files={files}
          language={language}
          flaggedLines={[]}
          onToggleLine={() => {}}
          readOnly
        />
      </AnnotationProvider>
    </div>
  )
}
