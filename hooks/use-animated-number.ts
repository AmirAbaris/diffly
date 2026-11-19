"use client"

import * as React from "react"

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
  const prevTargetRef = React.useRef<number>(targetValue)
  const animationFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const startValue = prevTargetRef.current
    const diff = targetValue - startValue

    if (diff === 0) {
      setDisplayValue(targetValue)
      return
    }

    const startTime = performance.now()

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic interpolation
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + diff * easeOut

      if (decimals === 0) {
        setDisplayValue(Math.round(current))
      } else {
        const factor = Math.pow(10, decimals)
        setDisplayValue(Math.round(current * factor) / factor)
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        setDisplayValue(targetValue)
        prevTargetRef.current = targetValue
      }
    }

    animationFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [targetValue, duration, decimals])

  return displayValue
}
