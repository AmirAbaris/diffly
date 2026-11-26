"use client"

import * as React from "react"
import { MessageSquare, SquarePen } from "lucide-react"
import { CoachThreadListItem } from "@/components/coach/coach-thread-list-item"
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
import { Skeleton } from "@/components/ui/skeleton"
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
          {threads.map((thread) => (
            <CoachThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              isEditing={editingId === thread.id}
              editingTitle={editingTitle}
              isSaving={savingId === thread.id}
              onSelect={() => onSelectThread(thread.id)}
              onStartRename={() => startRename(thread)}
              onEditingTitleChange={setEditingTitle}
              onSubmitRename={() => void submitRename(thread)}
              onCancelRename={cancelRename}
              onRequestDelete={() => setPendingDelete(thread)}
            />
          ))}
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
