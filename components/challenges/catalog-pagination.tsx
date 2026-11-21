"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface CatalogPaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage])
  if (currentPage > 1) pages.add(currentPage - 1)
  if (currentPage < totalPages) pages.add(currentPage + 1)

  return Array.from(pages).sort((a, b) => a - b)
}

export function CatalogPagination({
  page,
  totalPages,
  onPageChange,
}: CatalogPaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  const safePage = Math.min(Math.max(1, page), totalPages)
  const visiblePages = getVisiblePages(safePage, totalPages)

  return (
    <nav
      aria-label="Catalog pagination"
      data-testid="catalog-pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        Page <span className="font-medium text-foreground">{safePage}</span> of{" "}
        {totalPages}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          data-testid="pagination-prev"
          className="h-8 text-xs"
        >
          <ChevronLeft aria-hidden="true" data-icon="inline-start" />
          <span>Previous</span>
        </Button>

        <div className="flex items-center gap-1">
          {visiblePages.map((pageNum, index) => {
            const prevPage = visiblePages[index - 1]
            const showEllipsis =
              prevPage !== undefined && pageNum - prevPage > 1
            const isCurrent = pageNum === safePage

            return (
              <React.Fragment key={pageNum}>
                {showEllipsis && (
                  <span
                    aria-hidden="true"
                    className="px-1.5 text-xs text-muted-foreground select-none"
                  >
                    …
                  </span>
                )}
                <Button
                  type="button"
                  variant={isCurrent ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Page ${pageNum}`}
                  data-testid={`pagination-page-${pageNum}`}
                  className="h-8 min-w-8 px-2 text-xs tabular-nums"
                >
                  {pageNum}
                </Button>
              </React.Fragment>
            )
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          data-testid="pagination-next"
          className="h-8 text-xs"
        >
          <span>Next</span>
          <ChevronRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}
