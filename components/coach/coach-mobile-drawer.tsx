"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import {
  CoachRailTabs,
  type CoachRailTabsProps,
} from "@/components/coach/coach-context-rail"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

export interface CoachMobileDrawerProps extends CoachRailTabsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CoachMobileDrawer({
  open,
  onOpenChange,
  onSelectThread,
  onNewChat,
  onSelectPrompt,
  onCreateChallenge,
  ...railProps
}: CoachMobileDrawerProps) {
  const closeAfter =
    <Args extends unknown[]>(fn?: (...args: Args) => void) =>
    (...args: Args) => {
      fn?.(...args)
      onOpenChange(false)
    }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="lg:hidden" />
        <DialogPrimitive.Content
          data-testid="coach-mobile-drawer"
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-border bg-background text-foreground shadow-xl outline-none lg:hidden data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <DialogTitle className="text-xs font-semibold tracking-tight text-foreground">
              Coach Workspace
            </DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Close sidebar"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </Button>
            </DialogClose>
          </div>
          <Separator />
          <CoachRailTabs
            {...railProps}
            onSelectThread={closeAfter(onSelectThread)}
            onNewChat={closeAfter(onNewChat)}
            onSelectPrompt={closeAfter(onSelectPrompt)}
            onCreateChallenge={
              onCreateChallenge ? closeAfter(onCreateChallenge) : undefined
            }
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
