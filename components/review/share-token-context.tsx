"use client"

import * as React from "react"

interface ShareTokenContextValue {
  slug: string | null
  shareToken: string | null
}

const ShareTokenContext = React.createContext<ShareTokenContextValue>({
  slug: null,
  shareToken: null,
})

export function ShareTokenProvider({
  slug,
  shareToken,
  children,
}: {
  slug: string
  shareToken: string | null
  children: React.ReactNode
}) {
  const value = React.useMemo(() => ({ slug, shareToken }), [slug, shareToken])

  return (
    <ShareTokenContext.Provider value={value}>
      {children}
    </ShareTokenContext.Provider>
  )
}

export function useShareTokenContext(): ShareTokenContextValue {
  return React.useContext(ShareTokenContext)
}
