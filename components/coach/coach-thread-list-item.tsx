"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Pencil, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { CoachThreadSummary } from "@/types/coach-thread"

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function formatRelativeTime(isoDate: string): string {
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return ""
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return "Just now"
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  const date = new Date(timestamp)
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`
}

export interface CoachThreadListItemProps {
  thread: CoachThreadSummary
  isActive: boolean
  isEditing: boolean
  editingTitle: string
  isSaving: boolean
  onSelect: () => void
  onStartRename: () => void
  onEditingTitleChange: (value: string) => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onRequestDelete: () => void
}

export function CoachThreadListItem({
  thread,
  isActive,
  isEditing,
  editingTitle,
  isSaving,
  onSelect,
  onStartRename,
  onEditingTitleChange,
  onSubmitRename,
  onCancelRename,
  onRequestDelete,
}: CoachThreadListItemProps) {
  const isDebrief = thread.mode === "debrief"

  return (
    <li
      data-testid={`coach-thread-item-${thread.id}`}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors",
        isActive
          ? "border-border bg-muted/70 text-foreground"
          : "border-transparent hover:border-border/60 hover:bg-muted/40"
      )}
    >
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            value={editingTitle}
            onChange={(event) => onEditingTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onSubmitRename()
              } else if (event.key === "Escape") {
                event.preventDefault()
                onCancelRename()
              }
            }}
            disabled={isSaving}
            aria-label="Conversation title"
            data-testid={`coach-thread-rename-input-${thread.id}`}
            autoFocus
            className="h-7 px-2 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isSaving}
            onClick={onSubmitRename}
            aria-label="Save title"
            data-testid={`coach-thread-rename-save-${thread.id}`}
            className="shrink-0"
          >
            <Check aria-hidden="true" className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isSaving}
            onClick={onCancelRename}
            aria-label="Cancel rename"
            data-testid={`coach-thread-rename-cancel-${thread.id}`}
            className="shrink-0"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onSelect}
            aria-current={isActive ? "true" : undefined}
            data-testid={`coach-thread-select-${thread.id}`}
            className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="truncate text-xs font-medium text-foreground">
              {thread.title}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              {isDebrief ? (
                <Badge
                  variant="secondary"
                  size="sm"
                  data-testid={`coach-thread-debrief-badge-${thread.id}`}
                  className="h-4 px-1 text-[10px]"
                >
                  Debrief
                </Badge>
              ) : null}
              <span>{formatRelativeTime(thread.updated_at)}</span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            {isDebrief && thread.challenge_slug ? (
              <Button
                variant="ghost"
                size="icon-xs"
                asChild
                className="text-muted-foreground hover:text-foreground"
              >
                <Link
                  href={`/challenges/${encodeURIComponent(thread.challenge_slug)}`}
                  aria-label={`Open challenge ${thread.challenge_slug}`}
                  data-testid={`coach-thread-challenge-link-${thread.id}`}
                >
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onStartRename}
              aria-label={`Rename ${thread.title}`}
              data-testid={`coach-thread-rename-${thread.id}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil aria-hidden="true" className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRequestDelete}
              aria-label={`Delete ${thread.title}`}
              data-testid={`coach-thread-delete-${thread.id}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden="true" className="size-3" />
            </Button>
          </div>
        </>
      )}
    </li>
  )
}
