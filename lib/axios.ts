import axios from "axios"
import { getOrCreateGuestSessionId } from "@/lib/session"

export const apiClient = axios.create({
  baseURL: "",
  timeout: 10000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

apiClient.interceptors.request.use((config) => {
  const sessionId = getOrCreateGuestSessionId()
  if (sessionId && !config.headers["X-Diffly-Session-Id"]) {
    config.headers["X-Diffly-Session-Id"] = sessionId
  }
  return config
})
