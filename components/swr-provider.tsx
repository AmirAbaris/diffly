"use client"

import * as React from "react"
import { SWRConfig } from "swr"
import { swrFetcher } from "@/lib/swr-fetcher"

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: true,
        dedupingInterval: 5000,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  )
}
