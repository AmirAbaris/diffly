"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { REVIEW_KEYMAP } from "./keymap"

export interface ShortcutOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutOverlay({ open, onOpenChange }: ShortcutOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="shortcut-overlay"
        className="max-w-lg rounded-xl border border-border bg-background p-6"
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-base font-semibold">
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Navigate code lines, flag ranges, and edit inline findings without
            leaving the keyboard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border/60">
          {REVIEW_KEYMAP.map((entry) => (
            <div
              key={entry.action}
              className="flex items-center justify-between gap-4 py-2 text-xs"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">
                  {entry.label}
                </span>
                <span className="text-muted-foreground">
                  {entry.description}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {entry.displayKeys.map((keyLabel) => (
                  <kbd
                    key={keyLabel}
                    className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
                  >
                    {keyLabel}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
