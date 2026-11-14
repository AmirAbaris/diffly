"use client"

import * as React from "react"
import { CustomChallengeModal } from "@/components/challenges/generator-modal/custom-challenge-modal"
import { InteractiveDiffSandbox } from "@/components/landing/interactive-diff-sandbox"
import { LandingTaxonomyGrid } from "@/components/landing/landing-taxonomy-grid"
import { ReactiveShaderStage } from "@/components/landing/reactive-shader-stage"
import {
  evaluateSandboxSelection,
  toggleSandboxLine,
  type SandboxScenario,
  type ScenarioId,
} from "@/lib/landing/sandbox-engine"
import { LANDING_SANDBOX_SCENARIOS } from "@/lib/landing/scenarios"
import {
  createShaderSignalBridge,
  type ShaderMachinePhase,
  type ShaderSignalBridge,
} from "@/lib/landing/shader-signal-bridge"

export interface LandingPageProps {
  readonly scenarios?: readonly [SandboxScenario, ...SandboxScenario[]]
  readonly defaultScenarioId?: ScenarioId
}

export function LandingPage({
  scenarios = LANDING_SANDBOX_SCENARIOS,
  defaultScenarioId,
}: LandingPageProps) {
  const [bridge] = React.useState<ShaderSignalBridge>(() =>
    createShaderSignalBridge()
  )

  const [activeScenarioId, setActiveScenarioId] = React.useState<ScenarioId>(
    defaultScenarioId ?? scenarios[0].id
  )
  const [flaggedByScenario, setFlaggedByScenario] = React.useState<
    Readonly<Record<string, ReadonlySet<number>>>
  >({})
  const [activePhase, setActivePhase] =
    React.useState<ShaderMachinePhase>("idle-scan")

  const activeScenario = React.useMemo(() => {
    return (
      scenarios.find((scenario) => scenario.id === activeScenarioId) ??
      scenarios[0]
    )
  }, [activeScenarioId, scenarios])

  const flaggedLineNumbers = React.useMemo(() => {
    return flaggedByScenario[activeScenario.id] ?? new Set<number>()
  }, [activeScenario.id, flaggedByScenario])

  const readout = React.useMemo(() => {
    return evaluateSandboxSelection(activeScenario, flaggedLineNumbers)
  }, [activeScenario, flaggedLineNumbers])

  React.useEffect(() => {
    return bridge.subscribePhase((nextPhase) => {
      setActivePhase(nextPhase)
    })
  }, [bridge])

  function handleSelectScenario(nextId: ScenarioId) {
    setActiveScenarioId(nextId)
    const nextScenario =
      scenarios.find((scenario) => scenario.id === nextId) ?? scenarios[0]
    const nextFlags = flaggedByScenario[nextScenario.id] ?? new Set<number>()
    const nextReadout = evaluateSandboxSelection(nextScenario, nextFlags)
    const completionRatio =
      nextReadout.totalDefects > 0
        ? nextReadout.detectedDefects / nextReadout.totalDefects
        : 0

    bridge.syncScenarioState(completionRatio, nextReadout.isScenarioSolved)
  }

  function handleToggleLine(lineNumber: number, rowNormalizedY: number) {
    const transition = toggleSandboxLine(
      activeScenario,
      flaggedLineNumbers,
      lineNumber
    )

    setFlaggedByScenario((prev) => ({
      ...prev,
      [activeScenario.id]: transition.nextFlaggedLines,
    }))

    const completionRatio =
      transition.readout.totalDefects > 0
        ? transition.readout.detectedDefects / transition.readout.totalDefects
        : 0

    bridge.setCompletionRatio(
      transition.readout.isScenarioSolved ? 1 : completionRatio
    )
    bridge.emitImpulse(
      transition.verdict,
      rowNormalizedY,
      transition.severityWeight,
      transition.readout.isScenarioSolved
    )
  }

  function handleResetScenario() {
    setFlaggedByScenario((prev) => ({
      ...prev,
      [activeScenario.id]: new Set<number>(),
    }))
    bridge.syncScenarioState(0, false)
  }

  return (
    <main data-testid="diffly-landing-page" className="flex flex-col">
      <section
        aria-label="Interactive Code Review Arena Showcase"
        className="border-b border-border"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 border-x border-border lg:grid-cols-12">
          <div className="lg:col-span-6">
            <ReactiveShaderStage
              bridge={bridge}
              readout={readout}
              activePhase={activePhase}
            />
          </div>

          <div className="lg:col-span-6">
            <InteractiveDiffSandbox
              scenarios={scenarios}
              activeScenario={activeScenario}
              flaggedLineNumbers={flaggedLineNumbers}
              readout={readout}
              onSelectScenario={handleSelectScenario}
              onToggleLine={handleToggleLine}
              onResetScenario={handleResetScenario}
            />
          </div>
        </div>
      </section>

      <LandingTaxonomyGrid />
      <CustomChallengeModal />
    </main>
  )
}
