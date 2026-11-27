"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface LeaderboardPaginationProps {
  page: number
  totalPages: number
  isValidating: boolean
  onPageChange: (page: number) => void
}

export function LeaderboardPagination({
  page,
  totalPages,
  isValidating,
  onPageChange,
}: LeaderboardPaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <nav
      aria-label="Leaderboard pagination"
      data-testid="leaderboard-pagination"
      className="flex items-center justify-between gap-4"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Page {page} of {totalPages}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || isValidating}
          onClick={() => onPageChange(page - 1)}
          data-testid="leaderboard-prev-page"
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          <span>Previous</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages || isValidating}
          onClick={() => onPageChange(page + 1)}
          data-testid="leaderboard-next-page"
        >
          <span>Next</span>
          <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
