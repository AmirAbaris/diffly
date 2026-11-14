import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LandingPage } from "@/components/landing/landing-page"
import {
  evaluateSandboxSelection,
  toggleSandboxLine,
} from "@/lib/landing/sandbox-engine"
import { LANDING_SANDBOX_SCENARIOS } from "@/lib/landing/scenarios"
import { createShaderSignalBridge } from "@/lib/landing/shader-signal-bridge"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-custom-challenges", () => ({
  useCustomChallenges: () => ({
    challenges: [],
    total: 0,
    quotaLimit: 5,
    remainingQuota: 5,
    isQuotaFull: false,
    isLoading: false,
    error: undefined,
    deleteChallenge: vi.fn(),
    clearAllChallenges: vi.fn(),
    mutate: vi.fn(),
  }),
}))

describe("LandingPage & Sandbox Engine", () => {
  beforeEach(() => {
    useCustomChallengeModalStore.setState({
      isOpen: false,
      initialTab: "generate",
    })
  })

  it("computes precision, recall, and F1 scores deterministically from flagged lines", () => {
    const scenario = LANDING_SANDBOX_SCENARIOS[0]

    const emptyReadout = evaluateSandboxSelection(scenario, new Set())
    expect(emptyReadout.detectedDefects).toBe(0)
    expect(emptyReadout.precisionScore).toBe(0)
    expect(emptyReadout.recallScore).toBe(0)
    expect(emptyReadout.f1Score).toBe(0)
    expect(emptyReadout.isScenarioSolved).toBe(false)

    const hitTransition = toggleSandboxLine(scenario, new Set(), 4)
    expect(hitTransition.verdict).toBe("defect-hit")
    expect(hitTransition.readout.detectedDefects).toBe(1)
    expect(hitTransition.readout.falsePositives).toBe(0)
    expect(hitTransition.readout.precisionScore).toBe(100)
    expect(hitTransition.readout.recallScore).toBe(100)
    expect(hitTransition.readout.f1Score).toBe(100)
    expect(hitTransition.readout.isScenarioSolved).toBe(true)

    const fpTransition = toggleSandboxLine(
      scenario,
      hitTransition.nextFlaggedLines,
      2
    )
    expect(fpTransition.verdict).toBe("false-positive")
    expect(fpTransition.readout.falsePositives).toBe(1)
    expect(fpTransition.readout.precisionScore).toBe(50)
    expect(fpTransition.readout.recallScore).toBe(100)
    expect(fpTransition.readout.f1Score).toBe(67)
    expect(fpTransition.readout.isScenarioSolved).toBe(false)
  })

  it("tracks shader signal impulses and exponential decay without React state coupling", () => {
    const bridge = createShaderSignalBridge()
    const observedPhases: string[] = []
    bridge.subscribePhase((phase) => observedPhases.push(phase))
    expect(bridge.getPhase()).toBe("idle-scan")

    bridge.sampleUniforms(800, 600, 0.0)

    bridge.setPointer({ x: 0.25, y: 0.75 })
    bridge.setDarkTheme(false)
    bridge.emitImpulse("defect-hit", 0.4, 1.0, false)
    expect(bridge.getPhase()).toBe("defect-pulse")

    const initialUniforms = bridge.sampleUniforms(800, 600, 5.0)
    expect(initialUniforms.resolution).toEqual([800, 600])
    expect(initialUniforms.isDark).toBe(0.0)
    expect(initialUniforms.pointer).toEqual([0.25, 0.75])
    expect(initialUniforms.pulseOrigin[1]).toBeCloseTo(0.4, 3)
    expect(initialUniforms.pulseIntensity).toBeGreaterThan(0.9)
    expect(initialUniforms.machinePhase).toBe(1.0)

    const decayedUniforms = bridge.sampleUniforms(800, 600, 10.0)
    expect(decayedUniforms.pulseIntensity).toBe(0)
    expect(bridge.getPhase()).toBe("idle-scan")
    expect(observedPhases).toEqual(["defect-pulse", "idle-scan"])
  })

  it("renders the landing page, falls back gracefully without WebGPU, and scores interactive diff clicks", async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    expect(screen.getByTestId("diffly-landing-page")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: /Audit Agent Diffs Before They Ship to Production/i,
      })
    ).toBeInTheDocument()

    expect(screen.getByTestId("stage-f1-readout")).toHaveTextContent("F1: 0%")

    const defectRow = screen.getByTestId("sandbox-diff-line-4")
    await user.click(defectRow)

    expect(screen.getByTestId("sandbox-defect-drawer-4")).toBeInTheDocument()
    expect(
      screen.getByText(/Non-Atomic Check-Then-Act Lock Read/i)
    ).toBeInTheDocument()
    expect(screen.getByTestId("stage-f1-readout")).toHaveTextContent("F1: 100%")
    expect(screen.getByTestId("stage-precision-readout")).toHaveTextContent(
      "100%"
    )
    expect(screen.getByTestId("stage-recall-readout")).toHaveTextContent("100%")

    const benignRow = screen.getByTestId("sandbox-diff-line-2")
    await user.click(benignRow)

    expect(screen.getByTestId("sandbox-fp-drawer-2")).toBeInTheDocument()
    expect(screen.getByTestId("stage-fp-readout")).toHaveTextContent("1")
    expect(screen.getByTestId("stage-precision-readout")).toHaveTextContent(
      "50%"
    )
    expect(screen.getByTestId("sandbox-status-banner")).toHaveTextContent(
      /1 false positive/i
    )

    const resetButton = screen.getByTestId("sandbox-reset-btn")
    await user.click(resetButton)

    expect(screen.getByTestId("stage-f1-readout")).toHaveTextContent("F1: 0%")

    const sqliTab = screen.getByTestId(
      "sandbox-scenario-tab-sql-injection-sink"
    )
    await user.click(sqliTab)

    expect(screen.getByText("api/routes/audit_logs.py")).toBeInTheDocument()
    expect(
      screen.getByTestId("sandbox-open-full-challenge-link")
    ).toHaveAttribute("href", "/challenges/fastapi-raw-sql-injection")
  })
})
