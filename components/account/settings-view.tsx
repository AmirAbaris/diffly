"use client"

import * as React from "react"
import { CheckCircle2, LogOut } from "lucide-react"
import { AccountAuthEmpty } from "@/components/account/account-auth-empty"
import { AccountShell } from "@/components/account/account-shell"
import { SettingsAIConnectionCard } from "@/components/account/settings-gemini-card"
import { SettingsTimezoneCard } from "@/components/account/settings-timezone-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth, type AuthUser } from "@/hooks/use-auth"
import { useAuthProviders } from "@/hooks/use-auth-providers"
import { toast } from "@/hooks/use-toast"

const GITHUB_CONNECT_HREF = "/api/auth/github/login?next=/settings"

function SettingsAccountSkeleton() {
  return (
    <div data-testid="settings-loading" className="flex flex-col gap-6">
      {["sk-1", "sk-2"].map((key) => (
        <Card key={key}>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-full max-w-sm" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SettingsAuthenticatedAccountCards({
  user,
  logout,
}: {
  user: AuthUser
  logout: () => Promise<void>
}) {
  const { githubEnabled } = useAuthProviders()
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await logout()
      toast({
        title: "Signed out",
        description: "You have been signed out of your Diffly account.",
      })
    } catch {
      toast({
        title: "Sign out failed",
        description: "An error occurred while signing out.",
        variant: "destructive",
      })
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account &amp; GitHub</CardTitle>
          <CardDescription className="text-xs">
            Your Diffly account identity and linked OAuth sign-in methods.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Username</span>
              <span className="font-mono text-sm font-medium text-foreground">
                @{user.username}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Email</span>
              <span className="truncate text-sm text-foreground">
                {user.email}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Password Auth
              </span>
              <span className="text-sm text-foreground">
                {user.has_password === false
                  ? "GitHub OAuth only"
                  : "Password enabled"}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 p-4 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                GitHub Connection
              </span>
              <span className="text-xs text-muted-foreground">
                {user.github_login
                  ? `Linked to GitHub user @${user.github_login}.`
                  : "Link your GitHub account for one-click sign in."}
              </span>
            </div>

            {user.github_login ? (
              <Badge variant="success" data-testid="settings-github-linked">
                <CheckCircle2 aria-hidden="true" />
                <span>@{user.github_login}</span>
              </Badge>
            ) : githubEnabled ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={GITHUB_CONNECT_HREF}
                  data-testid="connect-github-button"
                >
                  Connect GitHub
                </a>
              </Button>
            ) : (
              <Badge variant="outline">GitHub OAuth unavailable</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">Session</CardTitle>
            <CardDescription className="text-xs">
              Currently signed in as @{user.username}. Signing out clears your
              active session cookie.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isSigningOut}
            onClick={handleSignOut}
            data-testid="settings-signout-button"
          >
            <LogOut data-icon="inline-start" aria-hidden="true" />
            <span>{isSigningOut ? "Signing out…" : "Sign Out"}</span>
          </Button>
        </CardHeader>
      </Card>
    </>
  )
}

export function SettingsView() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth()

  return (
    <AccountShell
      title="Settings"
      description="Manage AI & Agent connections, timezone preferences, connected OAuth providers, and your session."
    >
      <div data-testid="settings-view" className="flex flex-col gap-6">
        <SettingsAIConnectionCard />

        <SettingsTimezoneCard />

        {authLoading ? (
          <SettingsAccountSkeleton />
        ) : isAuthenticated && user ? (
          <SettingsAuthenticatedAccountCards user={user} logout={logout} />
        ) : (
          <AccountAuthEmpty
            title="Sign in to manage account settings"
            description="Your AI connection and timezone apply to this browser immediately. Sign in to connect GitHub and sync your review progress across devices."
            showGuestStatsLink
          />
        )}
      </div>
    </AccountShell>
  )
}
