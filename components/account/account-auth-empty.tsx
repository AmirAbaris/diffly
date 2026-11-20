"use client"

import * as React from "react"
import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useAuthModalStore } from "@/stores/auth-modal-store"

export interface AccountAuthEmptyProps {
  title: string
  description: string
  showGuestStatsLink?: boolean
  testId?: string
}

export function AccountAuthEmpty({
  title,
  description,
  showGuestStatsLink = false,
  testId = "account-auth-empty",
}: AccountAuthEmptyProps) {
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  return (
    <Empty data-testid={testId} className="border border-border bg-card/40">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        <Button
          type="button"
          onClick={() => openAuthModal("signin")}
          data-testid="account-auth-signin-button"
        >
          Sign In
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openAuthModal("signup")}
          data-testid="account-auth-signup-button"
        >
          Create Account
        </Button>
        {showGuestStatsLink && (
          <Button variant="ghost" asChild>
            <Link href="/stats">View Guest Stats</Link>
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}
