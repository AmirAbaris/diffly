import { apiClient } from "@/lib/axios"

export const swrFetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url)
  return response.data
}
