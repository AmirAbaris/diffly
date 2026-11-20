"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatNextChallengeReason,
  useNextChallenge,
} from "@/hooks/use-next-challenge"
import { toast } from "@/hooks/use-toast"

export interface NextDrillButtonProps {
  currentSlug: string
}

export function NextDrillButton({ currentSlug }: NextDrillButtonProps) {
  const router = useRouter()
  const { nextChallenge, fetchNextChallenge } = useNextChallenge(currentSlug)
  const [isNavigating, setIsNavigating] = React.useState(false)

  const handleClick = async () => {
    if (isNavigating) return
    setIsNavigating(true)
    try {
      const target = nextChallenge ?? (await fetchNextChallenge())
      if (target?.challenge?.slug) {
        router.push(`/challenges/${target.challenge.slug}`)
        return
      }
      toast({
        title: "No next drill available",
        description: "You have no other challenges queued right now.",
      })
    } finally {
      setIsNavigating(false)
    }
  }

  const reasonText = nextChallenge
    ? formatNextChallengeReason(nextChallenge.reason)
    : "Jump to the next recommended drill"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isNavigating}
            onClick={handleClick}
            data-testid="next-drill-button"
            className="h-8 gap-1 px-2 text-xs sm:gap-1.5 sm:px-2.5"
          >
            <span className="sm:hidden">Next</span>
            <span className="hidden sm:inline">Next drill</span>
            {isNavigating ? (
              <Loader2
                aria-hidden="true"
                data-icon="inline-end"
                className="animate-spin"
              />
            ) : (
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" data-testid="next-drill-tooltip">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{reasonText}</span>
            {nextChallenge?.challenge && (
              <span className="text-muted-foreground">
                {nextChallenge.challenge.title} ·{" "}
                {nextChallenge.challenge.category} (
                {Math.round(nextChallenge.category_mastery)}% mastery)
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
