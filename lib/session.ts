const SESSION_STORAGE_KEY = "diffly_session_id"

export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") {
    return ""
  }

  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (existing && existing.trim()) {
      return existing.trim()
    }

    const randomSuffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14)

    const newSessionId = `guest-${randomSuffix}`
    window.localStorage.setItem(SESSION_STORAGE_KEY, newSessionId)
    return newSessionId
  } catch {
    return "guest-fallback"
  }
}

export function setGuestSessionId(sessionId: string): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId.trim())
  } catch {
    // Ignore localStorage write failures in restrictive sandboxes
  }
}

export function clearGuestSessionId(): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore localStorage removals in restrictive sandboxes
  }
}
