"use client"

import * as React from "react"

export function useClipboard(timeoutMs = 2000) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const copy = React.useCallback(
    async (text: string) => {
      if (!text) return false
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          setCopied(false)
          timerRef.current = null
        }, timeoutMs)
        return true
      } catch {
        return false
      }
    },
    [timeoutMs]
  )

  return { copied, copy }
}
