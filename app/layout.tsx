import type { Metadata, Viewport } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistPixelSquare } from "geist/font/pixel"
import { GeistSans } from "geist/font/sans"

import "./globals.css"
import { SWRProvider } from "@/components/swr-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "Diffly - Code Review Arena",
    template: "%s | Diffly",
  },
  description:
    "Developer platform for reviewing realistic code diffs with hidden bugs, antipatterns, and vulnerabilities.",
  applicationName: "Diffly",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        GeistSans.variable,
        GeistMono.variable,
        GeistPixelSquare.variable,
        "font-sans"
      )}
    >
      <body>
        <ThemeProvider>
          <SWRProvider>{children}</SWRProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
