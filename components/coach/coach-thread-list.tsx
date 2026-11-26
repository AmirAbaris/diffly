"use client"

import * as React from "react"
import {
  Check,
  MessageSquare,
  Pencil,
  SquarePen,
  Trash2,
  X,
} from "lucide-react"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { CoachThreadSummary } from "@/types/coach-thread"

export interface CoachThreadListProps {
  threads: CoachThreadSummary[]
  activeThreadId: string | null
  isLoading: boolean
  onSelectThread: (threadId: string) => void
  onNewChat: () => void
  onRenameThread: (threadId: string, title: string) => Promise<unknown>
  onDeleteThread: (threadId: string) => Promise<void>
}

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

export function CoachThreadList({
  threads,
  activeThreadId,
  isLoading,
  onSelectThread,
  onNewChat,
  onRenameThread,
  onDeleteThread,
}: CoachThreadListProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingTitle, setEditingTitle] = React.useState("")
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<CoachThreadSummary | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const startRename = (thread: CoachThreadSummary) => {
    setEditingId(thread.id)
    setEditingTitle(thread.title)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingTitle("")
  }

  const submitRename = async (thread: CoachThreadSummary) => {
    const trimmed = editingTitle.trim()
    if (!trimmed || trimmed === thread.title) {
      cancelRename()
      return
    }
    setSavingId(thread.id)
    try {
      await onRenameThread(thread.id, trimmed)
      cancelRename()
    } catch {
      // SWR rollback preserves prior title; keep editor open for retry.
    } finally {
      setSavingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    try {
      await onDeleteThread(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 p-3 pb-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewChat}
          data-testid="coach-rail-new-chat-button"
          className="w-full justify-start text-xs"
        >
          <SquarePen data-icon="inline-start" aria-hidden="true" />
          <span>New Chat</span>
        </Button>
      </div>

      {isLoading && threads.length === 0 ? (
        <div
          data-testid="coach-thread-list-loading"
          className="flex flex-col gap-2 p-3"
        >
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : threads.length === 0 ? (
        <div
          data-testid="coach-thread-list-empty"
          className="flex flex-1 items-center justify-center p-4"
        >
          <Empty className="gap-3 border border-border/60 p-6">
            <EmptyHeader className="gap-1.5">
              <EmptyMedia variant="icon" className="mb-1 size-9">
                <MessageSquare aria-hidden="true" className="size-4" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No saved chats yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Send a message to Agent Coach and your conversation will appear
                here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ul
          data-testid="coach-thread-list"
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3"
        >
          {threads.map((thread) => {
            const isActive = thread.id === activeThreadId
            const isEditing = editingId === thread.id
            const isSaving = savingId === thread.id

            return (
              <li
                key={thread.id}
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
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void submitRename(thread)
                        } else if (event.key === "Escape") {
                          event.preventDefault()
                          cancelRename()
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
                      onClick={() => void submitRename(thread)}
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
                      onClick={cancelRename}
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
                      onClick={() => onSelectThread(thread.id)}
                      aria-current={isActive ? "true" : undefined}
                      data-testid={`coach-thread-select-${thread.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="truncate text-xs font-medium text-foreground">
                        {thread.title}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatRelativeTime(thread.updated_at)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startRename(thread)}
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
                        onClick={() => setPendingDelete(thread)}
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
          })}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setPendingDelete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">
                {pendingDelete?.title}
              </span>{" "}
              from your Coach history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={() => void confirmDelete()}
              data-testid="coach-thread-delete-confirm"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
