"use client"

import * as React from "react"
import Link from "next/link"
import {
  User as UserIcon,
  BarChart3,
  MessageSquare,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthCallbackToast } from "@/components/auth/auth-callback-toast"
import { AuthModal } from "@/components/auth/auth-modal"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import { cn } from "@/lib/utils"

export interface UserNavProps {
  className?: string
  onOpenStats?: () => void
}

export function UserNav({ className, onOpenStats }: UserNavProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const handleSignOut = async () => {
    try {
      await logout()
      toast({
        title: "Signed out",
        description: "You have been signed out of your Diffly account.",
        variant: "default",
      })
    } catch {
      toast({
        title: "Sign out failed",
        description: "An error occurred while signing out.",
        variant: "destructive",
      })
    }
  }

  let content: React.ReactNode

  if (isLoading) {
    content = (
      <div
        data-testid="user-nav-loading"
        className={cn("flex items-center gap-2", className)}
      >
        <Skeleton className="h-8 w-16 rounded-md sm:w-28" />
      </div>
    )
  } else if (!isAuthenticated || !user) {
    content = (
      <div
        data-testid="user-nav-unauthenticated"
        className={cn("flex items-center gap-2", className)}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => openAuthModal("signin")}
          data-testid="sign-in-button"
          className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Sign In
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => openAuthModal("signup")}
          data-testid="register-button"
          className="h-8 px-3 text-xs font-medium"
        >
          Register
        </Button>
      </div>
    )
  } else {
    const initials = (user.username || "User").slice(0, 2).toUpperCase()

    content = (
      <div
        data-testid="user-nav-authenticated"
        className={cn("flex items-center", className)}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="user-nav-trigger"
              aria-label={`Open account menu for @${user.username}`}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/20 py-1 pr-2.5 pl-1.5 text-xs transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Avatar className="size-5 border border-border">
                {user.avatar_url && (
                  <AvatarImage src={user.avatar_url} alt={user.username} />
                )}
                <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <span className="hidden max-w-[100px] truncate font-medium text-foreground sm:inline-block">
                @{user.username}
              </span>

              <ChevronDown
                aria-hidden="true"
                className="hidden size-3.5 text-muted-foreground sm:inline-block"
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 p-1.5"
          >
            <DropdownMenuLabel className="p-2 font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-xs leading-none font-semibold text-foreground">
                  @{user.username}
                </p>
                <p className="truncate text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem
                asChild
                className="cursor-pointer gap-2 text-xs"
                data-testid="user-menu-profile"
              >
                <Link href="/profile">
                  <UserIcon
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                asChild
                className="cursor-pointer gap-2 text-xs"
                data-testid="user-menu-stats"
              >
                <Link href="/stats" onClick={() => onOpenStats?.()}>
                  <BarChart3
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                  <span>Stats</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                asChild
                className="cursor-pointer gap-2 text-xs"
                data-testid="user-menu-coach"
              >
                <Link href="/coach">
                  <MessageSquare
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                  <span>Agent Coach</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                asChild
                className="cursor-pointer gap-2 text-xs"
                data-testid="user-menu-settings"
              >
                <Link href="/settings">
                  <Settings
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-2 text-xs"
              data-testid="user-menu-signout"
              onClick={handleSignOut}
            >
              <LogOut aria-hidden="true" className="size-3.5" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <>
      {content}
      <React.Suspense fallback={null}>
        <AuthCallbackToast />
      </React.Suspense>
      <AuthModal />
    </>
  )
}
