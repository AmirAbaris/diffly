"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
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
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Diffly Account
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sign in or create an account to save your review metrics and sync
            progress across sessions.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
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
            <TabsTrigger value="signin" className="text-xs">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="text-xs">
              Register
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
