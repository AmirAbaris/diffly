"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  Inbox,
  Link2,
  Link2Off,
  Loader2,
  Share2,
  Trash2,
} from "lucide-react"
import { DifficultyBadge } from "@/components/challenges/catalog-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useClipboard } from "@/hooks/use-clipboard"
import { toast } from "@/hooks/use-toast"
import { buildChallengeShareUrl } from "@/lib/share-url"
import {
  formatLanguageLabel,
  type ChallengeSummary,
  type ShareChallengeResponse,
} from "@/types/challenge"

export interface CustomChallengesListProps {
  challenges: ChallengeSummary[]
  isLoading: boolean
  onDelete: (id: number | string) => Promise<unknown>
  onToggleShare?: (
    id: number | string,
    enabled: boolean
  ) => Promise<ShareChallengeResponse>
  onSwitchToGenerate: () => void
  onCloseModal?: () => void
}

export function CustomChallengesList({
  challenges,
  isLoading,
  onDelete,
  onToggleShare,
  onSwitchToGenerate,
  onCloseModal,
}: CustomChallengesListProps) {
  const [deletingId, setDeletingId] = React.useState<number | string | null>(
    null
  )
  const [sharingId, setSharingId] = React.useState<number | string | null>(null)
  const [copiedId, setCopiedId] = React.useState<number | string | null>(null)
  const { copied, copy } = useClipboard()

  const handleDelete = async (challenge: ChallengeSummary) => {
    try {
      setDeletingId(challenge.id)
      await onDelete(challenge.id)
      setCopiedId((prev) => (prev === challenge.id ? null : prev))
      toast({
        title: "Challenge deleted",
        description: `"${challenge.title}" was removed. You freed 1 custom challenge slot.`,
        variant: "default",
      })
    } catch {
      toast({
        title: "Deletion failed",
        description: "Could not delete this challenge. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleShare = async (
    challenge: ChallengeSummary,
    enabled: boolean
  ) => {
    if (!onToggleShare) return
    try {
      setSharingId(challenge.id)
      const res = await onToggleShare(challenge.id, enabled)
      if (res.share_token) {
        const shareUrl = buildChallengeShareUrl(
          res.slug || challenge.slug,
          res.share_token
        )
        const didCopy = await copy(shareUrl)
        if (didCopy) {
          setCopiedId(challenge.id)
        }
        toast({
          title: "Share link enabled",
          description: didCopy
            ? "Unlisted link copied to clipboard."
            : "Anyone with the unlisted link can view this challenge.",
          variant: "success",
        })
      } else {
        setCopiedId((prev) => (prev === challenge.id ? null : prev))
        toast({
          title: "Sharing disabled",
          description: `"${challenge.title}" is now private again.`,
          variant: "default",
        })
      }
    } catch {
      toast({
        title: "Sharing update failed",
        description: "Could not update sharing state. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSharingId(null)
    }
  }

  const handleCopyLink = async (challenge: ChallengeSummary) => {
    if (!challenge.share_token) return
    const shareUrl = buildChallengeShareUrl(
      challenge.slug,
      challenge.share_token
    )
    const didCopy = await copy(shareUrl)
    if (didCopy) {
      setCopiedId(challenge.id)
    }
    toast({
      title: didCopy ? "Link copied" : "Copy failed",
      description: didCopy
        ? "Unlisted share link copied to clipboard."
        : "Unable to write share link to clipboard.",
      variant: didCopy ? "success" : "destructive",
    })
  }

  if (isLoading && challenges.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        <span>Loading your custom challenges…</span>
      </div>
    )
  }

  if (challenges.length === 0) {
    return (
      <Empty data-testid="custom-challenges-empty" className="border py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No custom challenges yet</EmptyTitle>
          <EmptyDescription>
            You have 5 available custom slots. Generate your first personalized
            code review challenge using Gemini.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            onClick={onSwitchToGenerate}
            data-testid="create-first-challenge-btn"
          >
            Create Your First Challenge
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid="custom-challenges-list"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Your Private Library ({challenges.length}/5)
        </span>
        <span>Share, review, or delete to free quota</span>
      </div>

      <div className="flex max-h-[320px] min-w-0 flex-col gap-2 overflow-y-auto pr-1">
        {challenges.map((ch) => {
          const isDeleting = deletingId === ch.id
          const isUpdatingShare = sharingId === ch.id
          const isRowBusy = isDeleting || isUpdatingShare
          const isShared = Boolean(ch.is_shared || ch.share_token)

          return (
            <div
              key={ch.id}
              data-testid={`custom-challenge-item-${ch.id}`}
              className="group flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DifficultyBadge difficulty={ch.difficulty} />
                  <Badge variant="outline">{ch.category}</Badge>
                  <Badge variant="secondary" className="font-mono">
                    {formatLanguageLabel(ch.language)}
                  </Badge>
                  {isShared && <Badge variant="info">Unlisted</Badge>}
                  {ch.is_solved && (
                    <Badge variant="success" className="tabular-nums">
                      {ch.best_score !== null
                        ? `Solved · ${ch.best_score}%`
                        : "Solved"}
                    </Badge>
                  )}
                </div>

                <Link
                  href={`/challenges/${ch.slug}`}
                  onClick={onCloseModal}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {ch.title}
                </Link>

                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {ch.description}
                </p>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  <span>{ch.estimated_minutes}m</span>
                  <span aria-hidden="true">·</span>
                  <span>{ch.line_count} lines</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  asChild
                  onClick={onCloseModal}
                >
                  <Link href={`/challenges/${ch.slug}`}>
                    <span>Review</span>
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>

                {isShared && ch.share_token && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={isRowBusy}
                    onClick={() => handleCopyLink(ch)}
                    aria-label={`Copy share link for ${ch.title}`}
                    data-testid={`copy-share-challenge-${ch.id}`}
                  >
                    {copied && copiedId === ch.id ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Link2 aria-hidden="true" />
                    )}
                  </Button>
                )}

                {onToggleShare && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={isRowBusy}
                    onClick={() => handleToggleShare(ch, !isShared)}
                    aria-label={
                      isShared
                        ? `Disable sharing for ${ch.title}`
                        : `Share ${ch.title}`
                    }
                    className={
                      isShared
                        ? "text-muted-foreground hover:text-destructive"
                        : "text-muted-foreground hover:text-foreground"
                    }
                    data-testid={`toggle-share-challenge-${ch.id}`}
                  >
                    {isUpdatingShare ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
                      />
                    ) : isShared ? (
                      <Link2Off aria-hidden="true" />
                    ) : (
                      <Share2 aria-hidden="true" />
                    )}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={isRowBusy}
                  onClick={() => handleDelete(ch)}
                  aria-label={`Delete ${ch.title}`}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`delete-challenge-${ch.id}`}
                >
                  {isDeleting ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
