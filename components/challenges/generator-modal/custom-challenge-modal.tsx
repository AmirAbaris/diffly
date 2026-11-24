"use client"

import * as React from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  COACH_CREATE_CHALLENGE_HREF,
  CustomChallengesList,
} from "@/components/challenges/generator-modal/custom-challenges-list"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

export { COACH_CREATE_CHALLENGE_HREF }

export interface CustomChallengeModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CustomChallengeModal({
  open,
  onOpenChange,
}: CustomChallengeModalProps) {
  const storeIsOpen = useCustomChallengeModalStore((s) => s.isOpen)
  const storeSetIsOpen = useCustomChallengeModalStore((s) => s.setIsOpen)

  const isControlled = open !== undefined
  const isModalOpen = isControlled ? open : storeIsOpen

  const {
    customChallenges,
    total,
    quotaLimit,
    isQuotaFull,
    isLoading,
    deleteCustomChallenge,
    toggleChallengeShare,
  } = useCustomChallenges()

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen)
    } else {
      storeSetIsOpen(newOpen)
    }
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        data-testid="custom-challenge-modal-content"
      >
        <DialogHeader className="gap-1">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="text-base font-semibold tracking-tight text-balance">
              Custom Challenge Library
            </DialogTitle>
            <Badge
              variant={isQuotaFull ? "warning" : "secondary"}
              className="tabular-nums"
              data-testid="modal-quota-badge"
            >
              {total}/{quotaLimit} Used
            </Badge>
          </div>
          <DialogDescription className="text-xs text-pretty text-muted-foreground">
            Manage your private AI-generated challenges. Create new challenges
            in Agent Coach.
          </DialogDescription>
        </DialogHeader>

        <CustomChallengesList
          challenges={customChallenges}
          isLoading={isLoading}
          onDelete={deleteCustomChallenge}
          onToggleShare={toggleChallengeShare}
          onCloseModal={handleClose}
        />

        <DialogFooter>
          <Button asChild size="sm" data-testid="modal-open-coach-create-btn">
            <Link href={COACH_CREATE_CHALLENGE_HREF} onClick={handleClose}>
              <Sparkles data-icon="inline-start" aria-hidden="true" />
              <span>Create in Agent Coach</span>
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
