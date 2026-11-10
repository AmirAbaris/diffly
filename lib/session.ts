const PRIMARY_SESSION_STORAGE_KEY = "diffly_session_id"
const LEGACY_SESSION_STORAGE_KEY = "diffly_guest_session_id"

export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") {
    return ""
  }

  try {
    const existing =
      window.localStorage.getItem(PRIMARY_SESSION_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
    if (existing && existing.trim()) {
      const trimmed = existing.trim()
      window.localStorage.setItem(PRIMARY_SESSION_STORAGE_KEY, trimmed)
      return trimmed
    }

    const randomSuffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14)

    const newSessionId = `guest-${randomSuffix}`
    window.localStorage.setItem(PRIMARY_SESSION_STORAGE_KEY, newSessionId)
    window.localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, newSessionId)
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
    const trimmed = sessionId.trim()
    window.localStorage.setItem(PRIMARY_SESSION_STORAGE_KEY, trimmed)
    window.localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, trimmed)
  } catch {
    // Ignore localStorage write failures in restrictive sandboxes
  }
}

export function clearGuestSessionId(): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.removeItem(PRIMARY_SESSION_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY)
  } catch {
    // Ignore localStorage removals in restrictive sandboxes
  }
}
