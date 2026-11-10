"use client"

import * as React from "react"
import { LogIn, UserPlus, Sparkles, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
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

  const isControlled = open !== undefined
  const isModalOpen = isControlled ? open : storeIsOpen
  const defaultTab = initialTab ?? storeInitialTab

  const [activeTab, setActiveTab] = React.useState<AuthTab>(defaultTab)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setErrorMessage(null)
    } else {
      setActiveTab(defaultTab)
      setErrorMessage(null)
    }

    if (isControlled) {
      onOpenChange?.(newOpen)
    } else {
      storeSetIsOpen(newOpen)
    }
  }

  const handleSuccess = () => {
    setErrorMessage(null)
    if (isControlled) {
      onOpenChange?.(false)
    } else {
      storeSetIsOpen(false)
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Diffly Account
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Sign in or create an account to save your review metrics and compete
            on the arena leaderboard.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val as AuthTab)
            setErrorMessage(null)
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin" className="gap-1.5 text-xs">
              <LogIn className="size-3.5" />
              <span>Sign In</span>
            </TabsTrigger>
            <TabsTrigger value="signup" className="gap-1.5 text-xs">
              <UserPlus className="size-3.5" />
              <span>Register</span>
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
