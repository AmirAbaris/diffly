const GUEST_SESSION_STORAGE_KEY = "diffly_guest_session_id"

export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") {
    return ""
  }

  try {
    const existing = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY)
    if (existing && existing.trim()) {
      return existing.trim()
    }

    const randomSuffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14)

    const newSessionId = `guest-${randomSuffix}`
    window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, newSessionId)
    return newSessionId
  } catch {
    return "guest-fallback"
  }
}
