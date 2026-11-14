"use client"

import * as React from "react"
import { Check, Flag } from "lucide-react"
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

  // Check if user has uploaded a real GIF
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
        } catch {
          // Ignore localStorage errors
        }
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
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="flagging-guide-modal"
        className="max-h-[92vh] max-w-2xl overflow-y-auto p-5 sm:p-6"
      >
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500">
              <Flag className="size-4 fill-amber-500 text-amber-500" />
            </span>
            <DialogTitle className="text-base font-semibold sm:text-lg">
              How to Flag Code Defects
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
            Spot bugs or security flaws in the snippet, flag the affected lines,
            and submit your review comment.
          </DialogDescription>
        </DialogHeader>

        {/* Media or Interactive Demonstration Container */}
        <div className="relative mt-2 flex flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
          {gifAvailable ? (
            <div className="relative aspect-video w-full overflow-hidden bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gifSrc}
                alt="Demonstration of flagging code lines"
                className="h-full w-full object-contain"
                data-testid="flagging-guide-gif"
              />
            </div>
          ) : (
            <FlaggingGuideDemo />
          )}
        </div>

        {/* 3 Step Visual Guide */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-md border border-border/70 bg-card/40 p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                1
              </span>
              <span className="text-xs font-semibold text-foreground">
                Hover Any Line
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Moving your cursor over the code reveals a ghost flag icon in the
              left gutter.
            </p>
          </div>

          <div className="flex flex-col gap-1 rounded-md border border-border/70 bg-card/40 p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                2
              </span>
              <span className="text-xs font-semibold text-foreground">
                Click to Flag
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Click the line number or flag icon to mark defect lines. The row
              turns amber.
            </p>
          </div>

          <div className="flex flex-col gap-1 rounded-md border border-border/70 bg-card/40 p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                3
              </span>
              <span className="text-xs font-semibold text-foreground">
                Explain &amp; Submit
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Flagged lines attach to your review draft. Write your critique and
              click Submit!
            </p>
          </div>
        </div>

        <DialogFooter className="mt-3 flex flex-col gap-2.5 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="dont-show-flag-guide-checkbox"
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              id="dont-show-flag-guide-checkbox"
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleDontShowAgainChange(e.target.checked)}
              className="size-3.5 rounded border-border accent-primary"
              data-testid="dont-show-guide-checkbox"
            />
            <span>Don&apos;t show this automatically on challenge start</span>
          </label>

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenChange(false)}
            className="h-8 gap-1.5 px-4 text-xs font-medium"
            data-testid="close-guide-button"
          >
            <Check className="size-3.5" />
            <span>Got it, start reviewing</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
