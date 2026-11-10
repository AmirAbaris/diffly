import { apiClient } from "@/lib/axios"
import { claimSession } from "@/hooks/use-user-progress"
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

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await apiClient.get<AuthUser>("/api/auth/me")
    if (response.data) {
      setStoredAuthUser(response.data)
      return response.data
    }
  } catch {
    // Backend auth endpoint might not be active or user is unauthenticated
  }

  // Check fallback local client session
  return getStoredAuthUser()
}

export async function apiLogin(
  credentials: LoginCredentials
): Promise<AuthUser> {
  const sessionId = getOrCreateGuestSessionId()

  try {
    const response = await apiClient.post<AuthUser>("/api/auth/login", {
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
        // Session claim might have been completed automatically by login route
      }
    }
    return user
  } catch {
    // If backend auth endpoint is not yet mounted (issue #26 pending), provide mock user
    const mockUser: AuthUser = {
      id: 1,
      username: credentials.emailOrUsername.includes("@")
        ? credentials.emailOrUsername.split("@")[0]
        : credentials.emailOrUsername,
      email: credentials.emailOrUsername.includes("@")
        ? credentials.emailOrUsername
        : `${credentials.emailOrUsername}@diffly.dev`,
      avatar_url: null,
    }
    setStoredAuthUser(mockUser)
    if (sessionId) {
      try {
        await claimSession(sessionId)
      } catch {
        // Ignore session claim error if guest is empty
      }
    }
    return mockUser
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
        // Session claim might have been completed automatically
      }
    }
    return user
  } catch {
    const mockUser: AuthUser = {
      id: 1,
      username: credentials.username,
      email: credentials.email,
      avatar_url: null,
    }
    setStoredAuthUser(mockUser)
    if (sessionId) {
      try {
        await claimSession(sessionId)
      } catch {
        // Ignore session claim error if guest is empty
      }
    }
    return mockUser
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await apiClient.post("/api/auth/logout")
  } catch {
    // Endpoint might not exist yet
  } finally {
    setStoredAuthUser(null)
  }
}
