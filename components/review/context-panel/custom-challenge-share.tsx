"use client"

import * as React from "react"
import {
  Check,
  Copy,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  Share2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useClipboard } from "@/hooks/use-clipboard"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import { toast } from "@/hooks/use-toast"
import {
  buildChallengeSharePath,
  buildChallengeShareUrl,
} from "@/lib/share-url"
import type { ChallengeDetail } from "@/types/challenge"

export interface CustomChallengeShareProps {
  challenge: ChallengeDetail
}

type PendingShareAction = "enable" | "rotate" | "revoke" | null

function SharedChallengeNotice() {
  return (
    <section
      data-testid="shared-challenge-notice"
      aria-label="Unlisted custom challenge notice"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3.5"
    >
      <div className="flex items-center gap-2">
        <Badge variant="info">Unlisted Share</Badge>
        <span className="text-xs font-medium text-foreground">
          Read-only shared scenario
        </span>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        You are viewing an unlisted custom challenge via a share link. Private
        drafts and owner controls remain hidden.
      </p>
    </section>
  )
}

function ActiveShareControls({
  sharePath,
  copied,
  pendingAction,
  onCopy,
  onRotate,
  onRevoke,
}: {
  sharePath: string
  copied: boolean
  pendingAction: PendingShareAction
  onCopy: () => void
  onRotate: () => void
  onRevoke: () => void
}) {
  const isBusy = pendingAction !== null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
        <Link2
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <code
          data-testid="custom-share-url-preview"
          className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
        >
          {sharePath}
        </code>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={isBusy}
          onClick={onCopy}
          data-testid="copy-share-link-btn"
        >
          {copied ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Copy aria-hidden="true" data-icon="inline-start" />
          )}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={isBusy}
          onClick={onRotate}
          data-testid="rotate-share-link-btn"
        >
          {pendingAction === "rotate" ? (
            <Loader2
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
          )}
          <span>Rotate</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={isBusy}
          onClick={onRevoke}
          className="text-muted-foreground hover:text-destructive"
          data-testid="revoke-share-link-btn"
        >
          {pendingAction === "revoke" ? (
            <Loader2
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Link2Off aria-hidden="true" data-icon="inline-start" />
          )}
          <span>Revoke</span>
        </Button>
      </div>
    </div>
  )
}

function OwnerShareControls({ challenge }: { challenge: ChallengeDetail }) {
  const { toggleChallengeShare } = useCustomChallenges({ enabled: false })
  const { copied, copy } = useClipboard()
  const [pendingAction, setPendingAction] =
    React.useState<PendingShareAction>(null)

  const shareToken = challenge.share_token ?? null
  const sharePath = shareToken
    ? buildChallengeSharePath(challenge.slug, shareToken)
    : null
  const shareUrl = shareToken
    ? buildChallengeShareUrl(challenge.slug, shareToken)
    : null

  const handleToggle = async (enabled: boolean, regenerate = false) => {
    const action: PendingShareAction = !enabled
      ? "revoke"
      : regenerate
        ? "rotate"
        : "enable"
    setPendingAction(action)
    try {
      const result = await toggleChallengeShare(
        challenge.id,
        enabled,
        regenerate
      )
      if (!result.share_token) {
        toast({
          title: "Sharing disabled",
          description: "This custom challenge is now a private draft again.",
          variant: "default",
        })
        return
      }
      const nextUrl = buildChallengeShareUrl(
        result.slug || challenge.slug,
        result.share_token
      )
      const didCopy = await copy(nextUrl)
      toast({
        title: regenerate ? "Share link rotated" : "Share link enabled",
        description: didCopy
          ? "Unlisted link copied to your clipboard."
          : "Anyone with the unlisted link can now view this challenge.",
        variant: "success",
      })
    } catch {
      toast({
        title: "Failed to update sharing",
        description: "Could not update unlisted share settings. Please retry.",
        variant: "destructive",
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    const didCopy = await copy(shareUrl)
    toast({
      title: didCopy ? "Link copied" : "Copy failed",
      description: didCopy
        ? "Unlisted share link copied to clipboard."
        : "Copy the URL manually from the field.",
      variant: didCopy ? "success" : "destructive",
    })
  }

  return (
    <section
      data-testid="custom-challenge-share-panel"
      aria-labelledby="custom-share-heading"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2
            id="custom-share-heading"
            className="text-xs font-semibold tracking-tight text-foreground"
          >
            Custom Scenario Access
          </h2>
          <Badge variant={shareToken ? "info" : "outline"}>
            {shareToken ? "Unlisted Link" : "Private Draft"}
          </Badge>
        </div>

        {!shareToken && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pendingAction !== null}
            onClick={() => handleToggle(true, false)}
            data-testid="enable-share-btn"
          >
            {pendingAction === "enable" ? (
              <Loader2
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Share2 aria-hidden="true" data-icon="inline-start" />
            )}
            <span>Share Link</span>
          </Button>
        )}
      </div>

      <p className="text-xs text-pretty text-muted-foreground">
        {shareToken
          ? "Anyone with this unlisted link can inspect and review this scenario without seeing your other private drafts."
          : "Only you can see this custom scenario until you generate an unlisted share link."}
      </p>

      {shareToken && sharePath && (
        <ActiveShareControls
          sharePath={sharePath}
          copied={copied}
          pendingAction={pendingAction}
          onCopy={handleCopy}
          onRotate={() => handleToggle(true, true)}
          onRevoke={() => handleToggle(false, false)}
        />
      )}
    </section>
  )
}

export function CustomChallengeShare({ challenge }: CustomChallengeShareProps) {
  if (challenge.is_public !== false) {
    return null
  }
  if (!challenge.is_owner) {
    return <SharedChallengeNotice />
  }
  return <OwnerShareControls challenge={challenge} />
}
