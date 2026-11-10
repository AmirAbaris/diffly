"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"

export interface SignInFormProps {
  onSuccess: () => void
  onError: (msg: string) => void
}

export function SignInForm({ onSuccess, onError }: SignInFormProps) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim()) {
      onError("Please enter your username or email.")
      return
    }

    setIsLoading(true)
    try {
      const user = await login({
        emailOrUsername: identifier.trim(),
        password,
      })
      toast({
        title: "Signed in successfully",
        description: `Welcome back, @${user.username}. Guest progress migrated.`,
        variant: "success",
      })
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to sign in. Please try again."
      onError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-identifier"
          className="text-xs font-medium text-foreground"
        >
          Username or Email
        </label>
        <Input
          id="login-identifier"
          name="identifier"
          type="text"
          placeholder="alex or alex@diffly.dev…"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={isLoading}
          autoComplete="username"
          spellCheck={false}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-password"
          className="text-xs font-medium text-foreground"
        >
          Password
        </label>
        <Input
          id="login-password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
        />
      </div>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Challenges completed in this browser transfer automatically to your
        account.
      </p>

      <Button type="submit" className="w-full gap-2" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </Button>
    </form>
  )
}
