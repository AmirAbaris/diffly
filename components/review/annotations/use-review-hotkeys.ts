"use client"

import * as React from "react"
import type { ReviewAction, ReviewKeyScope } from "./keymap"

export interface UseReviewHotkeysOptions {
  enabled?: boolean
  onAction: (action: ReviewAction, scope: ReviewKeyScope) => boolean | void
}

function isEditableElement(target: HTMLElement): boolean {
  return (
    target.isContentEditable ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT"
  )
}

export function resolveHotkeyScope(target: EventTarget | null): ReviewKeyScope {
  if (!(target instanceof HTMLElement)) {
    return "global"
  }
  if (target.closest("[data-review-thread]")) {
    return "thread"
  }
  if (isEditableElement(target)) {
    return "summary"
  }
  if (target.closest('[role="grid"], [data-line-key]')) {
    return "grid"
  }
  return "global"
}

function matchKeyAction(
  event: KeyboardEvent,
  scope: ReviewKeyScope
): ReviewAction | null {
  const isMod = event.metaKey || event.ctrlKey

  if (isMod && event.key === "Enter") {
    return "saveOrSubmit"
  }

  if (isMod || event.altKey) {
    return null
  }

  if (event.key === "Escape") {
    return "escape"
  }

  // Typing inside text fields only responds to Mod+Enter and Escape.
  if (scope === "thread" || scope === "summary") {
    return null
  }

  // Never intercept `d` so ThemeHotkey continues to work.
  if (event.key === "d" || event.key === "D") {
    return null
  }

  switch (event.key) {
    case "j":
      return event.shiftKey ? "extendDown" : "cursorDown"
    case "J":
      return "extendDown"
    case "ArrowDown":
      return event.shiftKey ? "extendDown" : "cursorDown"
    case "k":
      return event.shiftKey ? "extendUp" : "cursorUp"
    case "K":
      return "extendUp"
    case "ArrowUp":
      return event.shiftKey ? "extendUp" : "cursorUp"
    case "f":
      return "toggleFlag"
    case "c":
      return "commentOrEdit"
    case "Enter":
      return scope === "grid" ? "commentOrEdit" : null
    case "n":
      return "nextFinding"
    case "p":
      return "prevFinding"
    case "?":
      return "toggleHelp"
    default:
      return null
  }
}

const REPEATABLE_ACTIONS = new Set<ReviewAction>([
  "cursorDown",
  "cursorUp",
  "extendDown",
  "extendUp",
])

export function useReviewHotkeys({
  enabled = true,
  onAction,
}: UseReviewHotkeysOptions) {
  const onActionRef = React.useRef(onAction)
  React.useEffect(() => {
    onActionRef.current = onAction
  }, [onAction])

  React.useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return
      }

      const scope = resolveHotkeyScope(event.target)
      const action = matchKeyAction(event, scope)
      if (!action) return
      if (event.repeat && !REPEATABLE_ACTIONS.has(action)) return

      const handled = onActionRef.current(action, scope)
      if (handled !== false) {
        event.preventDefault()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [enabled])
}
