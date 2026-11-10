"use client"

import * as React from "react"
import { UserPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"

export interface SignUpFormProps {
  onSuccess: () => void
  onError: (msg: string) => void
}

export function SignUpForm({ onSuccess, onError }: SignUpFormProps) {
  const { register } = useAuth()
  const [username, setUsername] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      onError("Please enter a username.")
      return
    }
    if (!email.trim() || !email.includes("@")) {
      onError("Please enter a valid email address.")
      return
    }
    if (password && password !== confirmPassword) {
      onError("Passwords do not match.")
      return
    }

    setIsLoading(true)
    try {
      const user = await register({
        username: username.trim(),
        email: email.trim(),
        password,
      })
      toast({
        title: "Account created",
        description: `Welcome to Diffly, @${user.username}! Your progress is linked.`,
        variant: "success",
      })
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again."
      onError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor="register-username"
          className="text-xs font-medium text-foreground"
        >
          Username
        </label>
        <Input
          id="register-username"
          type="text"
          placeholder="e.g. dev_reviewer"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          autoComplete="username"
          required
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="register-email"
          className="text-xs font-medium text-foreground"
        >
          Email Address
        </label>
        <Input
          id="register-email"
          type="email"
          placeholder="e.g. dev@diffly.dev"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor="register-password"
            className="text-xs font-medium text-foreground"
          >
            Password
          </label>
          <Input
            id="register-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="register-confirm"
            className="text-xs font-medium text-foreground"
          >
            Confirm
          </label>
          <Input
            id="register-confirm"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
        ⚡ All past attempts and streak records will be associated with your new
        profile.
      </div>

      <Button type="submit" className="w-full gap-2" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Creating Account...</span>
          </>
        ) : (
          <>
            <UserPlus className="size-4" />
            <span>Create Account</span>
          </>
        )}
      </Button>
    </form>
  )
}
