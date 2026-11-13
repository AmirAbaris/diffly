"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import { cn } from "@/lib/utils"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

export interface CustomChallengeButtonProps {
  className?: string
}

export function CustomChallengeButton({
  className,
}: CustomChallengeButtonProps) {
  const openModal = useCustomChallengeModalStore(
    (s) => s.openCustomChallengeModal
  )
  const { total, quotaLimit, isQuotaFull } = useCustomChallenges()

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => openModal("generate")}
        className={cn("h-8 text-xs", className)}
        data-testid="generate-ai-challenge-btn"
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
        <span>Generate with AI</span>
      </Button>

      <button
        type="button"
        onClick={() => openModal("manage")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          isQuotaFull
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
            : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
        aria-label={`View custom challenges (${total} of ${quotaLimit} used)`}
        data-testid="custom-challenges-quota-badge"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            isQuotaFull ? "bg-amber-500" : "bg-emerald-500"
          )}
        />
        <span>
          Custom: {total}/{quotaLimit}
        </span>
      </button>
    </div>
  )
}
