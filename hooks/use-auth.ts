"use client"

import useSWR from "swr"
import {
  AUTH_USER_SWR_KEY,
  fetchCurrentUser,
  apiLogin,
  apiRegister,
  apiLogout,
  type AuthUser,
  type LoginCredentials,
  type RegisterCredentials,
} from "@/lib/auth"
import { mutateUserStats } from "@/hooks/use-user-stats"

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
    return loggedUser
  }

  const register = async (credentials: RegisterCredentials) => {
    const newUser = await apiRegister(credentials)
    await boundMutate(newUser, false)
    await mutateUserStats()
    return newUser
  }

  const logout = async () => {
    await apiLogout()
    await boundMutate(null, false)
    await mutateUserStats()
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

export type { AuthUser, LoginCredentials, RegisterCredentials }
