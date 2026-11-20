"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { DifflyLogo } from "@/components/brand/diffly-logo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GitHubOAuthButton } from "@/components/auth/github-oauth-button"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { Separator } from "@/components/ui/separator"
import { useAuthProviders } from "@/hooks/use-auth-providers"
import { useAuthModalStore, type AuthTab } from "@/stores/auth-modal-store"

export interface AuthModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialTab?: AuthTab
}

export function AuthModal({ open, onOpenChange, initialTab }: AuthModalProps) {
  const storeIsOpen = useAuthModalStore((s) => s.isOpen)
  const storeInitialTab = useAuthModalStore((s) => s.initialTab)
  const storeSetIsOpen = useAuthModalStore((s) => s.setIsOpen)
  const { githubEnabled } = useAuthProviders()

  const isControlled = open !== undefined
  const isModalOpen = isControlled ? open : storeIsOpen
  const defaultTab = initialTab ?? storeInitialTab

  const [tabOverride, setTabOverride] = React.useState<AuthTab | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Derive active tab from override or defaultTab
  const activeTab = tabOverride ?? defaultTab

  const handleOpenChange = (newOpen: boolean) => {
    setTabOverride(null)
    setErrorMessage(null)

    if (isControlled) {
      onOpenChange?.(newOpen)
    } else {
      storeSetIsOpen(newOpen)
    }
  }

  const handleSuccess = () => {
    setTabOverride(null)
    setErrorMessage(null)
    if (isControlled) {
      onOpenChange?.(false)
    } else {
      storeSetIsOpen(false)
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[420px]"
        data-testid="auth-modal-content"
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <DifflyLogo className="size-4" />
            <span>Diffly Account</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sign in or create an account to save your review metrics and sync
            progress across sessions.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div
            role="alert"
            data-testid="auth-error-banner"
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {githubEnabled && (
          <div className="flex flex-col gap-3">
            <GitHubOAuthButton />
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">
                or continue with email
              </span>
              <Separator className="flex-1" />
            </div>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setTabOverride(val as AuthTab)
            setErrorMessage(null)
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="signin"
              data-testid="auth-tab-signin"
              className="text-xs"
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              data-testid="auth-tab-signup"
              className="text-xs"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <SignInForm onSuccess={handleSuccess} onError={setErrorMessage} />
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <SignUpForm onSuccess={handleSuccess} onError={setErrorMessage} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
