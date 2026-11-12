"use client"

import axios from "axios"
import useSWR, { mutate } from "swr"
import { apiClient } from "@/lib/axios"
import { claimSession } from "@/hooks/use-user-progress"
import { mutateUserStats } from "@/hooks/use-user-stats"
import { getOrCreateGuestSessionId } from "@/lib/session"

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
  try {
    const response = await apiClient.get<AuthUser>(AUTH_USER_SWR_KEY)
    if (response.data) {
      setStoredAuthUser(response.data)
      return response.data
    }
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      (err.response?.status === 401 || err.response?.status === 403)
    ) {
      setStoredAuthUser(null)
      return null
    }
  }

  // Check fallback local client session (e.g. offline)
  return getStoredAuthUser()
}

export async function apiLogin(
  credentials: LoginCredentials
): Promise<AuthUser> {
  const sessionId = getOrCreateGuestSessionId()

  try {
    const response = await apiClient.post<AuthUser>("/api/auth/login", {
      identifier: credentials.emailOrUsername,
      username: credentials.emailOrUsername,
      password: credentials.password,
      session_id: sessionId,
    })
    const user = response.data
    setStoredAuthUser(user)
    if (sessionId) {
      try {
        await claimSession(sessionId)
      } catch {
        // Session claim is automatically completed server-side by /api/auth/login
      }
    }
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
  const sessionId = getOrCreateGuestSessionId()

  try {
    const response = await apiClient.post<AuthUser>("/api/auth/register", {
      email: credentials.email,
      username: credentials.username,
      password: credentials.password,
      session_id: sessionId,
    })
    const user = response.data
    setStoredAuthUser(user)
    if (sessionId) {
      try {
        await claimSession(sessionId)
      } catch {
        // Session claim is automatically completed server-side by /api/auth/register
      }
    }
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

export function useAuth() {
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
    await mutateUserStats()
    await mutate("/api/challenges")
    return loggedUser
  }

  const register = async (credentials: RegisterCredentials) => {
    const newUser = await apiRegister(credentials)
    await boundMutate(newUser, false)
    await mutateUserStats()
    await mutate("/api/challenges")
    return newUser
  }

  const logout = async () => {
    await apiLogout()
    await boundMutate(null, false)
    await mutateUserStats()
    await mutate("/api/challenges")
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
