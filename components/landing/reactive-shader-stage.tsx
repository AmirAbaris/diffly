"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Sparkles, Terminal } from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useReactiveDiffShader } from "@/hooks/use-reactive-diff-shader"
import type { SandboxEvaluationReadout } from "@/lib/landing/sandbox-engine"
import type {
  ShaderMachinePhase,
  ShaderSignalBridge,
} from "@/lib/landing/shader-signal-bridge"
import { cn } from "@/lib/utils"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

export interface ReactiveShaderStageProps {
  readonly bridge: ShaderSignalBridge
  readonly readout: SandboxEvaluationReadout
  readonly activePhase: ShaderMachinePhase
}

const PHASE_LABELS: Readonly<Record<ShaderMachinePhase, string>> = {
  "solved-harmonic": "LOCK_HARMONIC // DEFECT_ISOLATED",
  "defect-pulse": "ANOMALY_HIT // SIGNAL_LOCKED",
  "false-alarm": "FALSE_POSITIVE // NOISE_SPIKE",
  "idle-scan": "IDLE_SCAN // LATTICE_READY",
}

export function ReactiveShaderStage({
  bridge,
  readout,
  activePhase,
}: ReactiveShaderStageProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const openModal = useCustomChallengeModalStore(
    (s) => s.openCustomChallengeModal
  )

  const { canvasRef, status, triggerSingleFrame } = useReactiveDiffShader({
    bridge,
    isDark,
    maxFps: 60,
  })

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    bridge.setPointer({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })

    if (status === "reduced-motion") triggerSingleFrame()
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      data-testid="reactive-shader-stage"
      data-shader-status={status}
      className="relative flex h-full flex-col justify-between overflow-hidden border-b border-border bg-background p-6 sm:p-8 lg:border-r lg:border-b-0"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-testid="vgpu-shader-canvas"
        className={cn(
          "pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300",
          status === "fallback" ? "opacity-0" : "opacity-85"
        )}
      />

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:18px_18px]",
          status === "fallback" ? "opacity-75" : "opacity-25"
        )}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background/90"
      />

      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge
            variant="outline"
            className="bg-background/80 font-mono text-[11px] tracking-wider uppercase backdrop-blur-xs"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mr-1.5 size-1.5 rounded-full",
                activePhase === "solved-harmonic" ||
                  activePhase === "defect-pulse"
                  ? "bg-emerald-500"
                  : activePhase === "false-alarm"
                    ? "bg-destructive"
                    : "bg-foreground/60"
              )}
            />
            {PHASE_LABELS[activePhase]}
          </Badge>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <p className="font-pixel text-xs tracking-widest text-muted-foreground uppercase">
            CODE REVIEW ARENA
          </p>
          <h1 className="font-pixel text-3xl leading-[1.12] tracking-tight text-balance text-foreground sm:text-4xl lg:text-[2.65rem]">
            Audit Agent Diffs Before They Ship.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
            Spot race conditions, injection sinks, and sandbox escapes in real
            pull requests. Scored line by line.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild size="lg" data-testid="landing-enter-arena-cta">
            <Link href="/challenges">
              <span>Enter Arena</span>
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => openModal("generate")}
            data-testid="landing-generate-ai-cta"
            className="bg-background/85 backdrop-blur-xs"
          >
            <Sparkles aria-hidden="true" data-icon="inline-start" />
            <span>Generate Challenge</span>
          </Button>
        </div>
      </div>

      <div className="relative z-10 mt-10 flex flex-col gap-3 border-t border-border/80 pt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-mono text-muted-foreground">
            <Terminal className="size-3.5" aria-hidden="true" />
            <span>LIVE_TELEMETRY</span>
          </span>
          <span
            aria-live="polite"
            data-testid="stage-f1-readout"
            className="font-pixel text-sm tracking-tight text-foreground tabular-nums"
          >
            F1: {readout.f1Score}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border bg-background/80 px-3 py-2 backdrop-blur-xs">
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Precision
            </div>
            <div
              data-testid="stage-precision-readout"
              className="mt-0.5 font-pixel text-lg text-foreground tabular-nums"
            >
              {readout.precisionScore}%
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/80 px-3 py-2 backdrop-blur-xs">
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Recall
            </div>
            <div
              data-testid="stage-recall-readout"
              className="mt-0.5 font-pixel text-lg text-foreground tabular-nums"
            >
              {readout.recallScore}%
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/80 px-3 py-2 backdrop-blur-xs">
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              False Flags
            </div>
            <div
              data-testid="stage-fp-readout"
              className={cn(
                "mt-0.5 font-pixel text-lg tabular-nums",
                readout.falsePositives > 0
                  ? "text-destructive"
                  : "text-foreground"
              )}
            >
              {readout.falsePositives}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
