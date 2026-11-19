"use client"

import axios from "axios"
import useSWR, { useSWRConfig, type ScopedMutator } from "swr"
import { apiClient } from "@/lib/axios"
import { CUSTOM_CHALLENGES_SWR_KEY } from "@/hooks/use-custom-challenges"
import { toast } from "@/hooks/use-toast"
import { USER_PROGRESS_SWR_KEY } from "@/hooks/use-user-stats"

export interface AuthUser {
  id: number
  username: string
  email: string
  avatar_url?: string | null
}

export interface LoginCredentials {
  emailOrUsername: string
  password?: string
}

export interface RegisterCredentials {
  email: string
  username: string
  password?: string
}

export const AUTH_USER_SWR_KEY = "/api/auth/me"
const CLIENT_AUTH_KEY = "diffly_auth_user"

export function getStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(CLIENT_AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setStoredAuthUser(user: AuthUser | null): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    if (user) {
      window.localStorage.setItem(CLIENT_AUTH_KEY, JSON.stringify(user))
    } else {
      window.localStorage.removeItem(CLIENT_AUTH_KEY)
    }
  } catch {
    // Ignore localStorage write failures in restrictive sandboxes
  }
}

export function getAuthErrorMessage(
  err: unknown,
  fallback: string = "An unexpected error occurred"
): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim()
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((d) => (typeof d === "string" ? d : d.msg || d.message))
        .filter(Boolean)
        .join(". ")
    }
    if (err.response?.status === 401) {
      return "Invalid credentials"
    }
    if (err.response?.status === 400) {
      return "Invalid input data provided"
    }
    if (err.message && !err.response) {
      return err.message
    }
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const stored = getStoredAuthUser()

  try {
    const response = await apiClient.get<AuthUser>(AUTH_USER_SWR_KEY)
    if (response.data) {
      setStoredAuthUser(response.data)
      return response.data
    }
    setStoredAuthUser(null)
    return null
  } catch (err) {
    const status = axios.isAxiosError(err)
      ? err.response?.status
      : (err as { response?: { status?: number } } | null | undefined)?.response
          ?.status
    if (status === 401 || status === 403) {
      setStoredAuthUser(null)
      return null
    }
  }

  // Fallback to cached user only on transient non-auth errors (e.g. offline)
  return stored
}

function notifyIfClaimQuotaExceeded(
  headers: Record<string, unknown> | undefined
): void {
  const status = headers?.["x-diffly-claim-status"]
  if (status === "quota_exceeded") {
    toast({
      title: "Guest custom challenges kept separate",
      description:
        "Merging your guest custom challenges would exceed the 5-challenge limit. Delete an existing custom challenge to free space.",
      variant: "destructive",
    })
  }
}

export async function apiLogin(
  credentials: LoginCredentials
): Promise<AuthUser> {
  try {
    const response = await apiClient.post<AuthUser>("/api/auth/login", {
      identifier: credentials.emailOrUsername,
      username: credentials.emailOrUsername,
      password: credentials.password,
    })
    const user = response.data
    setStoredAuthUser(user)
    notifyIfClaimQuotaExceeded(response.headers)
    return user
  } catch (err) {
    const message = getAuthErrorMessage(
      err,
      "Failed to sign in. Please check your credentials."
    )
    throw new Error(message, { cause: err })
  }
}

export async function apiRegister(
  credentials: RegisterCredentials
): Promise<AuthUser> {
  try {
    const response = await apiClient.post<AuthUser>("/api/auth/register", {
      email: credentials.email,
      username: credentials.username,
      password: credentials.password,
    })
    const user = response.data
    setStoredAuthUser(user)
    notifyIfClaimQuotaExceeded(response.headers)
    return user
  } catch (err) {
    const message = getAuthErrorMessage(
      err,
      "Registration failed. Please try again."
    )
    throw new Error(message, { cause: err })
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await apiClient.post("/api/auth/logout")
  } catch {
    // Suppress network errors during logout
  } finally {
    setStoredAuthUser(null)
  }
}

const isChallengeScopedKey = (key: unknown): key is string =>
  typeof key === "string" &&
  key.startsWith("/api/challenges/") &&
  key !== CUSTOM_CHALLENGES_SWR_KEY

const isPrivateChallengeSliceKey = (key: string): boolean =>
  key.includes("/submissions") || key.includes("/solution")

async function revalidateAuthScopedCaches(
  mutateCache: ScopedMutator,
  options?: {
    clearPrivateSlices?: boolean
  }
): Promise<void> {
  const challengeScopedPromise = options?.clearPrivateSlices
    ? Promise.all([
        mutateCache(
          (key) => isChallengeScopedKey(key) && isPrivateChallengeSliceKey(key),
          undefined,
          { revalidate: true }
        ),
        mutateCache(
          (key) => isChallengeScopedKey(key) && !isPrivateChallengeSliceKey(key)
        ),
      ])
    : mutateCache(isChallengeScopedKey)

  await Promise.all([
    mutateCache(USER_PROGRESS_SWR_KEY),
    mutateCache("/api/challenges"),
    mutateCache(CUSTOM_CHALLENGES_SWR_KEY),
    challengeScopedPromise,
  ])
}

export function useAuth() {
  const { mutate: mutateCache } = useSWRConfig()
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
  } = useSWR<AuthUser | null>(AUTH_USER_SWR_KEY, fetchCurrentUser, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const user = data ?? null

  const login = async (credentials: LoginCredentials) => {
    const loggedUser = await apiLogin(credentials)
    await boundMutate(loggedUser, false)
    await revalidateAuthScopedCaches(mutateCache)
    return loggedUser
  }

  const register = async (credentials: RegisterCredentials) => {
    const newUser = await apiRegister(credentials)
    await boundMutate(newUser, false)
    await revalidateAuthScopedCaches(mutateCache)
    return newUser
  }

  const logout = async () => {
    await apiLogout()
    await boundMutate(null, false)
    await revalidateAuthScopedCaches(mutateCache, { clearPrivateSlices: true })
  }

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    isValidating,
    login,
    register,
    logout,
    mutate: boundMutate,
    error,
  }
}
