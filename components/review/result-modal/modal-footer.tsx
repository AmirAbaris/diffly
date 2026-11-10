import * as React from "react"
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileCode,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"

export interface ModalFooterActionsProps {
  showCanonicalSolution: boolean
  onTryAgain: () => void
  onToggleCanonical: () => void
  onNextChallenge: () => void
}

export function ModalFooterActions({
  showCanonicalSolution,
  onTryAgain,
  onToggleCanonical,
  onNextChallenge,
}: ModalFooterActionsProps) {
  return (
    <DialogFooter className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <Button
        type="button"
        variant="outline"
        onClick={onTryAgain}
        className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        data-testid="try-again-button"
      >
        <RotateCcw className="size-3.5" />
        <span>Try Again</span>
      </Button>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          onClick={onToggleCanonical}
          className="h-9 gap-1.5 text-xs"
          data-testid="view-canonical-solution-button"
        >
          <FileCode className="size-3.5" />
          <span>
            {showCanonicalSolution
              ? "Hide Staff Comparison"
              : "Compare with Staff Review"}
          </span>
          {showCanonicalSolution ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </Button>

        <Button
          type="button"
          onClick={onNextChallenge}
          className="h-9 gap-1.5 text-xs font-semibold"
          data-testid="next-challenge-button"
        >
          <span>Next Challenge</span>
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </DialogFooter>
  )
}
