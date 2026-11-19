"use client"

import * as React from "react"

function roundToDecimals(value: number, decimals: number): number {
  if (decimals <= 0) {
    return Math.round(value)
  }
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * Smoothly animates a numeric value using requestAnimationFrame.
 * Starts with initial value immediately to prevent SSR hydration mismatch.
 */
export function useAnimatedNumber(
  targetValue: number,
  duration = 500,
  decimals = 0
): number {
  const [displayValue, setDisplayValue] = React.useState<number>(targetValue)
  const currentValueRef = React.useRef<number>(targetValue)
  const animationFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    const startValue = currentValueRef.current
    const diff = targetValue - startValue

    if (diff === 0 || duration <= 0 || !Number.isFinite(targetValue)) {
      currentValueRef.current = targetValue
      setDisplayValue(targetValue)
      return
    }

    const startTime = performance.now()

    const step = (currentTime: number) => {
      const elapsed = Math.max(0, currentTime - startTime)
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic interpolation
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + diff * easeOut
      const rounded = roundToDecimals(current, decimals)

      if (progress < 1) {
        currentValueRef.current = current
        setDisplayValue(rounded)
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        currentValueRef.current = targetValue
        setDisplayValue(targetValue)
        animationFrameRef.current = null
      }
    }

    animationFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [targetValue, duration, decimals])

  return displayValue
}
