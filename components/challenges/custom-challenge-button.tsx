"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
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
        variant="default"
        size="sm"
        onClick={() => openModal("generate")}
        className={className}
        data-testid="generate-ai-challenge-btn"
      >
        <Sparkles
          aria-hidden="true"
          className="mr-1.5 size-3.5 text-primary-foreground"
        />
        Generate with AI
      </Button>

      <button
        type="button"
        onClick={() => openModal("manage")}
        className="cursor-pointer rounded-full focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`View custom challenges (${total} of ${quotaLimit} used)`}
        data-testid="custom-challenges-quota-badge"
      >
        <Badge
          variant={isQuotaFull ? "warning" : "secondary"}
          className="text-xs tabular-nums transition-colors hover:bg-muted"
        >
          Custom: {total}/{quotaLimit}
        </Badge>
      </button>
    </div>
  )
}
