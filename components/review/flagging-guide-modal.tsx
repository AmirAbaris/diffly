"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlaggingGuideDemo } from "@/components/review/flagging-guide-demo"
import { useArenaUIStore } from "@/stores/arena-ui-store"

export const FLAGGING_GUIDE_STORAGE_KEY = "diffly_has_seen_flag_guide"

export interface FlaggingGuideModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  gifSrc?: string
}

export function FlaggingGuideModal({
  open,
  onOpenChange,
  gifSrc = "/guides/flag-line-tutorial.gif",
}: FlaggingGuideModalProps) {
  const storeIsOpen = useArenaUIStore((s) => s.isFlagGuideOpen)
  const storeSetIsOpen = useArenaUIStore((s) => s.setIsFlagGuideOpen)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : storeIsOpen

  const [dontShowAgain, setDontShowAgain] = React.useState(() => {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem(FLAGGING_GUIDE_STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })
  const [gifAvailable, setGifAvailable] = React.useState(false)

  React.useEffect(() => {
    if (!gifSrc) return

    let isSubscribed = true
    const img = new Image()
    img.src = gifSrc
    img.onload = () => {
      if (isSubscribed) setGifAvailable(true)
    }
    img.onerror = () => {
      if (isSubscribed) setGifAvailable(false)
    }

    return () => {
      isSubscribed = false
    }
  }, [gifSrc])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && typeof window !== "undefined") {
        try {
          if (dontShowAgain) {
            window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")
          }
        } catch {}
      }

      if (isControlled) {
        onOpenChange?.(nextOpen)
      } else {
        storeSetIsOpen(nextOpen)
      }
    },
    [isControlled, onOpenChange, storeSetIsOpen, dontShowAgain]
  )

  const handleDontShowAgainChange = React.useCallback((checked: boolean) => {
    setDontShowAgain(checked)
    if (typeof window === "undefined") return
    try {
      if (checked) {
        window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")
      } else {
        window.localStorage.removeItem(FLAGGING_GUIDE_STORAGE_KEY)
      }
    } catch {}
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="flagging-guide-modal"
        className="max-h-[92vh] overflow-y-auto overscroll-contain sm:max-w-xl"
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">
            How to Flag Code Defects
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Spot bugs or security flaws in the snippet, flag the affected lines,
            and submit your review comment.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
          {gifAvailable ? (
            <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gifSrc}
                width={800}
                height={450}
                alt="Demonstration of flagging code lines"
                className="h-full w-full object-contain"
                data-testid="flagging-guide-gif"
              />
            </div>
          ) : (
            <FlaggingGuideDemo />
          )}
        </div>

        <ol className="divide-y divide-border rounded-lg border border-border bg-muted/10 text-xs">
          <li className="flex items-baseline gap-3 px-3.5 py-2.5">
            <span className="font-mono text-muted-foreground tabular-nums">
              01
            </span>
            <div className="min-w-0">
              <span className="font-medium text-foreground">
                Hover Any Line
              </span>
              <span className="text-muted-foreground">
                {" "}
                — Move your cursor over the code to reveal the flag button in
                the gutter.
              </span>
            </div>
          </li>

          <li className="flex items-baseline gap-3 px-3.5 py-2.5">
            <span className="font-mono text-muted-foreground tabular-nums">
              02
            </span>
            <div className="min-w-0">
              <span className="font-medium text-foreground">Click to Flag</span>
              <span className="text-muted-foreground">
                {" "}
                — Click the line number or flag icon to mark a defect line.
              </span>
            </div>
          </li>

          <li className="flex items-baseline gap-3 px-3.5 py-2.5">
            <span className="font-mono text-muted-foreground tabular-nums">
              03
            </span>
            <div className="min-w-0">
              <span className="font-medium text-foreground">
                Explain &amp; Submit
              </span>
              <span className="text-muted-foreground">
                {" "}
                — Flagged lines attach to your review draft. Write your critique
                and submit.
              </span>
            </div>
          </li>
        </ol>

        <DialogFooter className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="dont-show-flag-guide-checkbox"
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              id="dont-show-flag-guide-checkbox"
              name="dontShowFlagGuide"
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleDontShowAgainChange(e.target.checked)}
              className="size-3.5 rounded border-border accent-primary"
              data-testid="dont-show-guide-checkbox"
            />
            <span>Don&apos;t show automatically on challenge start</span>
          </label>

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenChange(false)}
            className="h-8 px-3.5 text-xs font-medium"
            data-testid="close-guide-button"
          >
            <span>Start Reviewing</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
