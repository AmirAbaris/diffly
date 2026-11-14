export type ScenarioId =
  "race-condition-lock" | "sql-injection-sink" | "prompt-injection-pipeline"

export type DiffLineKind = "context" | "add" | "del"

export type DefectSeverity = "critical" | "high" | "medium"

export interface SandboxDefectSpec {
  readonly id: string
  readonly severity: DefectSeverity
  readonly category: string
  readonly title: string
  readonly explanation: string
  readonly remediation: string
  readonly scoreWeight: number
}

export interface SandboxDiffLine {
  readonly lineNumber: number
  readonly oldLineNumber: number | null
  readonly newLineNumber: number | null
  readonly kind: DiffLineKind
  readonly content: string
  readonly defect?: SandboxDefectSpec
}

export interface SandboxScenario {
  readonly id: ScenarioId
  readonly codeLabel: string
  readonly title: string
  readonly agentModelLabel: string
  readonly language: "python" | "typescript"
  readonly filePath: string
  readonly prSummary: string
  readonly challengeSlug: string
  readonly lines: readonly SandboxDiffLine[]
}

export type LineInspectVerdict = "defect-hit" | "false-positive" | "cleared"

export interface SandboxEvaluationReadout {
  readonly scenarioId: ScenarioId
  readonly totalDefects: number
  readonly detectedDefects: number
  readonly falsePositives: number
  readonly precisionScore: number
  readonly recallScore: number
  readonly f1Score: number
  readonly isScenarioSolved: boolean
  readonly activeFindings: readonly SandboxDefectSpec[]
}

export interface LineToggleTransition {
  readonly nextFlaggedLines: ReadonlySet<number>
  readonly verdict: LineInspectVerdict
  readonly severityWeight: number
  readonly readout: SandboxEvaluationReadout
}

export function evaluateSandboxSelection(
  scenario: SandboxScenario,
  flaggedLineNumbers: ReadonlySet<number>
): SandboxEvaluationReadout {
  let totalDefects = 0
  let detectedDefects = 0
  let falsePositives = 0
  const activeFindings: SandboxDefectSpec[] = []

  for (const line of scenario.lines) {
    const isFlagged = flaggedLineNumbers.has(line.lineNumber)

    if (line.defect) {
      totalDefects += 1
      if (isFlagged) {
        detectedDefects += 1
        activeFindings.push(line.defect)
      }
    } else if (isFlagged) {
      falsePositives += 1
    }
  }

  const totalFlagged = detectedDefects + falsePositives
  const precisionScore =
    totalFlagged > 0 ? Math.round((detectedDefects / totalFlagged) * 100) : 100
  const recallScore =
    totalDefects > 0 ? Math.round((detectedDefects / totalDefects) * 100) : 100
  const f1Score =
    precisionScore + recallScore > 0 && detectedDefects > 0
      ? Math.round(
          (2 * precisionScore * recallScore) / (precisionScore + recallScore)
        )
      : 0

  const isScenarioSolved =
    totalDefects > 0 && detectedDefects === totalDefects && falsePositives === 0

  return {
    scenarioId: scenario.id,
    totalDefects,
    detectedDefects,
    falsePositives,
    precisionScore: totalFlagged === 0 ? 0 : precisionScore,
    recallScore,
    f1Score,
    isScenarioSolved,
    activeFindings,
  }
}

export function toggleSandboxLine(
  scenario: SandboxScenario,
  currentFlaggedLines: ReadonlySet<number>,
  lineNumber: number
): LineToggleTransition {
  const nextFlaggedLines = new Set(currentFlaggedLines)
  const targetLine = scenario.lines.find(
    (line) => line.lineNumber === lineNumber
  )

  let verdict: LineInspectVerdict = "cleared"
  let severityWeight = 0.4

  if (nextFlaggedLines.has(lineNumber)) {
    nextFlaggedLines.delete(lineNumber)
    verdict = "cleared"
  } else {
    nextFlaggedLines.add(lineNumber)
    if (targetLine?.defect) {
      verdict = "defect-hit"
      severityWeight = targetLine.defect.scoreWeight
    } else {
      verdict = "false-positive"
      severityWeight = 0.65
    }
  }

  const readout = evaluateSandboxSelection(scenario, nextFlaggedLines)

  return {
    nextFlaggedLines,
    verdict,
    severityWeight,
    readout,
  }
}
