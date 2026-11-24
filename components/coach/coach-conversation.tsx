"use client"

import * as React from "react"
import { ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface CoachConversationProps {
  children: React.ReactNode
  scrollKey: string | number
  className?: string
  contentClassName?: string
  ariaLabel?: string
}

const BOTTOM_THRESHOLD_PX = 48

export function CoachConversation({
  children,
  scrollKey,
  className,
  contentClassName,
  ariaLabel = "Agent Coach conversation",
}: CoachConversationProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const isPinnedRef = React.useRef(true)
  const lastScrollKeyRef = React.useRef<string | number>(scrollKey)
  const [showScrollButton, setShowScrollButton] = React.useState(false)

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isAtBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX
    isPinnedRef.current = isAtBottom
    setShowScrollButton(!isAtBottom)
  }, [])

  React.useEffect(() => {
    if (lastScrollKeyRef.current === scrollKey) return
    lastScrollKeyRef.current = scrollKey
    const el = scrollRef.current
    if (!el || !isPinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [scrollKey])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isPinnedRef.current = true
    setShowScrollButton(false)
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={ariaLabel}
        data-testid="coach-conversation"
        className={cn("flex-1 overflow-y-auto overscroll-contain", className)}
      >
        <div className={cn("flex flex-col", contentClassName)}>{children}</div>
      </div>

      {showScrollButton ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            data-testid="coach-scroll-to-bottom"
            className="pointer-events-auto rounded-full bg-background/95 shadow-xs backdrop-blur-xs"
          >
            <ArrowDown data-icon="inline-start" aria-hidden="true" />
            <span>Scroll to bottom</span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
