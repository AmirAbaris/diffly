"use client"

import * as React from "react"
import {
  User as UserIcon,
  BarChart3,
  Settings,
  LogOut,
  LogIn,
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

  if (isLoading) {
    return (
      <div
        data-testid="user-nav-loading"
        className={cn("flex items-center", className)}
      >
        <Skeleton className="size-8 rounded-full" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <>
        <div
          data-testid="user-nav-unauthenticated"
          className={cn("flex items-center", className)}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openAuthModal("signin")}
            data-testid="sign-in-button"
            className="h-8 gap-1.5 px-3 text-xs font-medium"
          >
            <LogIn className="size-3.5" />
            <span>Sign In</span>
          </Button>
        </div>

        <AuthModal />
      </>
    )
  }

  const initials = (user.username || "User").slice(0, 2).toUpperCase()

  return (
    <>
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
              className="flex items-center gap-1.5 rounded-full p-0.5 text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Avatar className="size-7 border border-border sm:size-8">
                {user.avatar_url && (
                  <AvatarImage src={user.avatar_url} alt={user.username} />
                )}
                <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <span className="hidden max-w-[100px] truncate font-medium text-foreground sm:inline-block">
                @{user.username}
              </span>

              <ChevronDown className="hidden size-3 text-muted-foreground sm:inline-block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 p-1.5 shadow-lg"
          >
            <DropdownMenuLabel className="p-2 font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs leading-none font-semibold text-foreground">
                  @{user.username}
                </p>
                <p className="truncate text-[11px] leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                onClick={() => {
                  toast({
                    title: "Profile",
                    description: `Viewing profile for @${user.username}. Profile management is active.`,
                  })
                }}
              >
                <UserIcon className="size-3.5 text-muted-foreground" />
                <span>Profile</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                onClick={() => {
                  if (onOpenStats) {
                    onOpenStats()
                  } else {
                    toast({
                      title: "Stats",
                      description:
                        "Review performance metrics are accessible via the header badges.",
                    })
                  }
                }}
              >
                <BarChart3 className="size-3.5 text-muted-foreground" />
                <span>Stats</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                onClick={() => {
                  toast({
                    title: "Settings",
                    description:
                      "Account preferences and notification settings.",
                  })
                }}
              >
                <Settings className="size-3.5 text-muted-foreground" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-2 text-xs"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AuthModal />
    </>
  )
}
