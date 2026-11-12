"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
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
  const [email, setEmail] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedEmail = email.trim()
    const trimmedUsername = username.trim()

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      onError("Please enter a valid email address.")
      return
    }
    if (!trimmedUsername) {
      onError("Please enter a username.")
      return
    }
    if (trimmedUsername.length < 3) {
      onError("Username must be at least 3 characters.")
      return
    }
    if (!password) {
      onError("Please enter a password.")
      return
    }
    if (password.length < 6) {
      onError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirmPassword) {
      onError("Passwords do not match.")
      return
    }

    setIsLoading(true)
    try {
      const user = await register({
        email: trimmedEmail,
        username: trimmedUsername,
        password,
      })
      toast({
        title: "Account created",
        description: `Welcome to Diffly, @${user.username}. Your progress is linked.`,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="register-email"
          className="text-xs font-medium text-foreground"
        >
          Email Address
        </label>
        <Input
          id="register-email"
          data-testid="register-email-input"
          name="email"
          type="email"
          placeholder="dev@diffly.dev…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          spellCheck={false}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="register-username"
          className="text-xs font-medium text-foreground"
        >
          Username
        </label>
        <Input
          id="register-username"
          data-testid="register-username-input"
          name="username"
          type="text"
          placeholder="dev_reviewer…"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          autoComplete="username"
          spellCheck={false}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="register-password"
            className="text-xs font-medium text-foreground"
          >
            Password
          </label>
          <Input
            id="register-password"
            data-testid="register-password-input"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="register-confirm"
            className="text-xs font-medium text-foreground"
          >
            Confirm
          </label>
          <Input
            id="register-confirm"
            data-testid="register-confirm-password-input"
            name="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Past attempts and streak records in this browser link to your new
        profile.
      </p>

      <Button
        type="submit"
        data-testid="sign-up-submit-button"
        className="w-full gap-2"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            <span>Creating Account…</span>
          </>
        ) : (
          <span>Create Account</span>
        )}
      </Button>
    </form>
  )
}
