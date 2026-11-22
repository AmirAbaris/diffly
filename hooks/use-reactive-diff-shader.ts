"use client"

import * as React from "react"
import { prepareShader } from "@vgpu/wgsl/prepare"
import { clock, effect, frame, frameLoop, init, surface } from "vgpu"
import type { FrameLoopHandle, Gpu } from "vgpu"
import {
  DIFF_FIELD_WGSL,
  type ShaderSignalBridge,
} from "@/lib/landing/shader-signal-bridge"

export type WebGpuRuntimeStatus =
  "initializing" | "running" | "reduced-motion" | "fallback"

export interface UseReactiveDiffShaderOptions {
  readonly bridge: ShaderSignalBridge
  readonly isDark: boolean
  readonly maxFps?: number
}

export interface UseReactiveDiffShaderReturn {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>
  readonly status: WebGpuRuntimeStatus
  readonly triggerSingleFrame: () => void
}

const PREPARED_DIFF_FIELD_SHADER = prepareShader(
  DIFF_FIELD_WGSL,
  "diff-field.wgsl"
)

function subscribeReducedMotion(callback: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {}
  }

  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  mediaQuery.addEventListener("change", callback)

  return () => {
    mediaQuery.removeEventListener("change", callback)
  }
}

function getReducedMotionSnapshot(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getReducedMotionServerSnapshot(): boolean {
  return false
}

export function useReactiveDiffShader(
  options: UseReactiveDiffShaderOptions
): UseReactiveDiffShaderReturn {
  const { bridge, isDark, maxFps = 60 } = options
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const renderOnceRef = React.useRef<(() => void) | null>(null)
  const startLoopRef = React.useRef<(() => void) | null>(null)
  const stopLoopRef = React.useRef<(() => void) | null>(null)
  const loopHandleRef = React.useRef<FrameLoopHandle | null>(null)
  const isLoopActiveRef = React.useRef(false)

  const [gpuReady, setGpuReady] = React.useState(false)
  const [gpuFailed, setGpuFailed] = React.useState(false)
  const prefersReducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )

  React.useEffect(() => {
    bridge.setDarkTheme(isDark)
  }, [bridge, isDark])

  React.useEffect(() => {
    return bridge.subscribeSignal(() => {
      if (!isLoopActiveRef.current) {
        renderOnceRef.current?.()
      }
    })
  }, [bridge])

  React.useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let cancelled = false
    let gpuInstance: Gpu | null = null

    async function bootWebGpu(targetCanvas: HTMLCanvasElement) {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        if (!cancelled) {
          setGpuFailed(true)
        }

        return
      }

      try {
        const gpu = await init({ powerPreference: "low-power" })

        if (cancelled) {
          gpu.dispose()

          return
        }

        gpuInstance = gpu
        const dpr =
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2)
            : 1

        const outputSurface = surface(gpu, targetCanvas, {
          dpr,
          autoResize: true,
        })

        const gpuClock = clock(gpu)
        const initialUniforms = bridge.sampleUniforms(
          outputSurface.size[0],
          outputSurface.size[1],
          0
        )

        const shaderEffect = effect(gpu, PREPARED_DIFF_FIELD_SHADER, {
          set: { u: initialUniforms },
        })

        function encodeSingleFrame() {
          if (cancelled || gpu.disposed || outputSurface.disposed) {
            return
          }

          frame(gpu, (f) => {
            const uniformsSnapshot = bridge.sampleUniforms(
              outputSurface.size[0],
              outputSurface.size[1],
              gpuClock.time
            )

            shaderEffect.set({ u: uniformsSnapshot })
            f.pass(outputSurface, shaderEffect)
          })
        }

        function stopAnimationLoop() {
          loopHandleRef.current?.stop()
          loopHandleRef.current = null
          isLoopActiveRef.current = false
        }

        function startAnimationLoop() {
          stopAnimationLoop()
          isLoopActiveRef.current = true
          loopHandleRef.current = frameLoop(
            gpu,
            (f) => {
              const uniformsSnapshot = bridge.sampleUniforms(
                outputSurface.size[0],
                outputSurface.size[1],
                gpuClock.time
              )

              shaderEffect.set({ u: uniformsSnapshot })
              f.pass(outputSurface, shaderEffect)
            },
            { fps: maxFps }
          )
        }

        renderOnceRef.current = encodeSingleFrame
        startLoopRef.current = startAnimationLoop
        stopLoopRef.current = stopAnimationLoop

        encodeSingleFrame()
        setGpuReady(true)
      } catch {
        if (!cancelled) {
          setGpuFailed(true)
        }
      }
    }

    void bootWebGpu(canvas)

    return () => {
      cancelled = true
      renderOnceRef.current = null
      startLoopRef.current = null
      stopLoopRef.current = null
      loopHandleRef.current?.stop()
      loopHandleRef.current = null
      isLoopActiveRef.current = false

      if (gpuInstance && !gpuInstance.disposed) {
        gpuInstance.dispose()
      }
    }
  }, [bridge, maxFps])

  React.useEffect(() => {
    if (!gpuReady || gpuFailed) {
      return
    }

    if (prefersReducedMotion) {
      stopLoopRef.current?.()
      renderOnceRef.current?.()
    } else {
      startLoopRef.current?.()
    }
  }, [gpuFailed, gpuReady, prefersReducedMotion])

  React.useEffect(() => {
    if (
      !gpuReady ||
      gpuFailed ||
      !prefersReducedMotion ||
      typeof window === "undefined"
    ) {
      return
    }

    function handleWindowResize() {
      renderOnceRef.current?.()
    }

    window.addEventListener("resize", handleWindowResize)

    return () => {
      window.removeEventListener("resize", handleWindowResize)
    }
  }, [gpuFailed, gpuReady, prefersReducedMotion])

  const triggerSingleFrame = React.useCallback(() => {
    if (!isLoopActiveRef.current) {
      renderOnceRef.current?.()
    }
  }, [])

  let status: WebGpuRuntimeStatus = "initializing"

  if (gpuFailed) {
    status = "fallback"
  } else if (gpuReady) {
    status = prefersReducedMotion ? "reduced-motion" : "running"
  }

  return {
    canvasRef,
    status,
    triggerSingleFrame,
  }
}
