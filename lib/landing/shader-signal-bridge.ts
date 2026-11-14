import type { LineInspectVerdict } from "@/lib/landing/sandbox-engine"

export type ShaderMachinePhase =
  "idle-scan" | "defect-pulse" | "false-alarm" | "solved-harmonic"

export interface NormalizedPoint {
  readonly x: number
  readonly y: number
}

export interface DiffFieldUniforms {
  readonly resolution: readonly [number, number]
  readonly time: number
  readonly isDark: number
  readonly pointer: readonly [number, number]
  readonly pulseOrigin: readonly [number, number]
  readonly pulseIntensity: number
  readonly machinePhase: number
  readonly completionRatio: number
  readonly _pad: number
}

export const DIFF_FIELD_WGSL = `
struct DiffFieldUniforms {
  resolution: vec2f,
  time: f32,
  isDark: f32,
  pointer: vec2f,
  pulseOrigin: vec2f,
  pulseIntensity: f32,
  machinePhase: f32,
  completionRatio: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: DiffFieldUniforms;

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let res = max(u.resolution, vec2f(1.0, 1.0));
  let uv = fragCoord.xy / res;
  let aspect = res.x / res.y;

  let cellSize = 18.0;
  let gridCoord = fragCoord.xy / cellSize;
  let cellId = floor(gridCoord);
  let cellUv = fract(gridCoord) - 0.5;

  let pAspect = vec2f((uv.x - u.pointer.x) * aspect, uv.y - u.pointer.y);
  let pointerDist = length(pAspect);
  let pointerField = exp(-pointerDist * 5.2);

  let pulseDelta = vec2f((uv.x - u.pulseOrigin.x) * aspect, uv.y - u.pulseOrigin.y);
  let pulseDist = length(pulseDelta);
  let waveFront = sin(pulseDist * 28.0 - u.time * 8.5) * 0.5 + 0.5;
  let pulseRing = exp(-abs(pulseDist - (1.0 - u.pulseIntensity) * 0.85) * 14.0) * u.pulseIntensity;
  let rowBand = exp(-abs(uv.y - u.pulseOrigin.y) * 26.0) * u.pulseIntensity;

  let scanCarrier = sin(cellId.y * 0.35 - u.time * 1.8 + cellId.x * 0.12) * 0.5 + 0.5;
  let cellNoise = hash21(cellId);
  let harmonicWave = sin(cellId.x * 0.25 + cellId.y * 0.25 - u.time * 2.4) * 0.5 + 0.5;

  let lineThickness = 0.045;
  let gridLine = max(
    smoothstep(0.5 - lineThickness, 0.5, abs(cellUv.x)),
    smoothstep(0.5 - lineThickness, 0.5, abs(cellUv.y))
  );

  let crossDist = min(abs(cellUv.x), abs(cellUv.y));
  let crossArm = step(max(abs(cellUv.x), abs(cellUv.y)), 0.16);
  let crosshair = (1.0 - smoothstep(0.0, 0.055, crossDist)) * crossArm;

  var signal = scanCarrier * 0.18 * step(0.62, cellNoise);
  signal += pointerField * 0.38;
  signal += (pulseRing * 0.75 + rowBand * 0.45) * (0.6 + 0.4 * waveFront);
  signal += u.completionRatio * harmonicWave * 0.22;

  let dotRadius = clamp(0.08 + signal * 0.26, 0.06, 0.36);
  let pixelDot = 1.0 - smoothstep(dotRadius - 0.04, dotRadius + 0.04, length(cellUv));

  let baseDark = vec3f(0.065, 0.067, 0.072);
  let baseLight = vec3f(0.975, 0.976, 0.980);
  let gridDark = vec3f(0.16, 0.165, 0.178);
  let gridLight = vec3f(0.86, 0.865, 0.878);

  var accentDark = vec3f(0.78, 0.80, 0.84);
  var accentLight = vec3f(0.18, 0.19, 0.22);

  if (u.machinePhase > 2.5) {
    accentDark = vec3f(0.20, 0.86, 0.58);
    accentLight = vec3f(0.05, 0.56, 0.36);
  } else if (u.machinePhase > 1.5) {
    accentDark = vec3f(0.95, 0.36, 0.32);
    accentLight = vec3f(0.80, 0.18, 0.16);
  } else if (u.machinePhase > 0.5) {
    accentDark = vec3f(0.24, 0.88, 0.62);
    accentLight = vec3f(0.06, 0.58, 0.38);
  }

  let bg = mix(baseLight, baseDark, u.isDark);
  let stroke = mix(gridLight, gridDark, u.isDark);
  let accent = mix(accentLight, accentDark, u.isDark);

  var color = bg;
  color = mix(color, stroke, gridLine * 0.55);
  color = mix(color, accent, crosshair * (0.25 + pointerField * 0.55));
  color = mix(color, accent, pixelDot * clamp(signal, 0.0, 0.92));

  return vec4f(color, 1.0);
}
`

export interface ShaderSignalBridge {
  emitImpulse(
    verdict: LineInspectVerdict,
    rowNormalizedY: number,
    severityWeight: number,
    isSolved: boolean,
    completionRatio?: number
  ): void
  syncScenarioState(
    completionRatio: number,
    isSolved: boolean,
    clearPulse?: boolean
  ): void
  setPointer(uv: NormalizedPoint): void
  setDarkTheme(isDark: boolean): void
  setCompletionRatio(ratio: number, isSolved?: boolean): void
  subscribeSignal(listener: () => void): () => void
  subscribePhase(listener: (phase: ShaderMachinePhase) => void): () => void
  getPhase(): ShaderMachinePhase
  sampleUniforms(
    width: number,
    height: number,
    elapsedSeconds: number
  ): DiffFieldUniforms
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0.5
  }

  return Math.min(1, Math.max(0, value))
}

function phaseFromCode(code: number): ShaderMachinePhase {
  if (code === 3.0) {
    return "solved-harmonic"
  }

  if (code === 2.0) {
    return "false-alarm"
  }

  if (code === 1.0) {
    return "defect-pulse"
  }

  return "idle-scan"
}

export function createShaderSignalBridge(): ShaderSignalBridge {
  let pointerX = 0.5
  let pointerY = 0.5
  let isDarkTheme = true
  let completionRatio = 0
  let pulseOriginX = 0.65
  let pulseOriginY = 0.5
  let pulseIntensity = 0
  let lastSampleTime: number | null = null
  let activeVerdict: LineInspectVerdict = "cleared"
  let solvedState = false
  let lastNotifiedPhase: ShaderMachinePhase = "idle-scan"
  const signalListeners = new Set<() => void>()
  const phaseListeners = new Set<(phase: ShaderMachinePhase) => void>()

  function resolveMachinePhaseCode(): number {
    if (solvedState && pulseIntensity < 0.15) {
      return 3.0
    }

    if (pulseIntensity >= 0.05) {
      if (activeVerdict === "defect-hit") {
        return 1.0
      }

      if (activeVerdict === "false-positive") {
        return 2.0
      }
    }

    return solvedState ? 3.0 : 0.0
  }

  function syncPhaseListeners() {
    const currentPhase = phaseFromCode(resolveMachinePhaseCode())

    if (currentPhase !== lastNotifiedPhase) {
      lastNotifiedPhase = currentPhase

      for (const listener of phaseListeners) {
        listener(currentPhase)
      }
    }
  }

  function notifySignal() {
    syncPhaseListeners()

    for (const listener of signalListeners) {
      listener()
    }
  }

  return {
    emitImpulse(
      verdict,
      rowNormalizedY,
      severityWeight,
      isSolved,
      nextCompletionRatio
    ) {
      activeVerdict = verdict
      solvedState = isSolved

      if (typeof nextCompletionRatio === "number") {
        completionRatio = clamp01(nextCompletionRatio)
      }

      pulseOriginX = 0.68
      pulseOriginY = clamp01(rowNormalizedY)
      pulseIntensity =
        verdict === "cleared" ? 0.25 : clamp01(0.65 + severityWeight * 0.35)
      lastSampleTime = null
      notifySignal()
    },

    syncScenarioState(nextCompletionRatio, isSolved, clearPulse = false) {
      completionRatio = clamp01(nextCompletionRatio)
      solvedState = isSolved

      if (clearPulse) {
        pulseIntensity = 0
        activeVerdict = "cleared"
        lastSampleTime = null
      }

      notifySignal()
    },

    setPointer(uv) {
      pointerX = clamp01(uv.x)
      pointerY = clamp01(uv.y)
    },

    setDarkTheme(isDark) {
      if (isDarkTheme === isDark) {
        return
      }

      isDarkTheme = isDark
      notifySignal()
    },

    setCompletionRatio(ratio, isSolved) {
      completionRatio = clamp01(ratio)
      solvedState =
        typeof isSolved === "boolean" ? isSolved : completionRatio >= 0.999
      notifySignal()
    },

    subscribeSignal(listener) {
      signalListeners.add(listener)

      return () => {
        signalListeners.delete(listener)
      }
    },

    subscribePhase(listener) {
      phaseListeners.add(listener)

      return () => {
        phaseListeners.delete(listener)
      }
    },

    getPhase() {
      return phaseFromCode(resolveMachinePhaseCode())
    },

    sampleUniforms(width, height, elapsedSeconds) {
      const dt =
        lastSampleTime === null
          ? 0
          : Math.max(0, elapsedSeconds - lastSampleTime)
      lastSampleTime = elapsedSeconds

      if (pulseIntensity > 0.001 && dt > 0) {
        pulseIntensity = pulseIntensity * Math.exp(-dt * 2.2)

        if (pulseIntensity < 0.01) {
          pulseIntensity = 0
        }
      }

      const code = resolveMachinePhaseCode()
      syncPhaseListeners()

      return {
        resolution: [Math.max(1, width), Math.max(1, height)],
        time: elapsedSeconds,
        isDark: isDarkTheme ? 1.0 : 0.0,
        pointer: [pointerX, pointerY],
        pulseOrigin: [pulseOriginX, pulseOriginY],
        pulseIntensity,
        machinePhase: code,
        completionRatio,
        _pad: 0,
      }
    },
  }
}
