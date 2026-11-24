"use client"

import * as React from "react"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

export interface CoachConversationProps {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  ariaLabel?: string
}

export function CoachConversation({
  children,
  className,
  contentClassName,
  ariaLabel = "Agent Coach conversation",
}: CoachConversationProps) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller
        data-testid="coach-conversation"
        className={cn("min-h-0 flex-1", className)}
      >
        <MessageScrollerViewport
          role="log"
          aria-live="polite"
          aria-label={ariaLabel}
        >
          <MessageScrollerContent className={cn("gap-6", contentClassName)}>
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton data-testid="coach-scroll-to-bottom" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
