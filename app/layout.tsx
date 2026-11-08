import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { Footer } from "@/components/layout/footer"
import { Header } from "@/components/layout/header"
import { SWRProvider } from "@/components/swr-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

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
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <SWRProvider>
            <div className="flex min-h-screen flex-col bg-background text-foreground">
              <Header />
              <Separator />
              <div className="flex-1">{children}</div>
              <Separator />
              <Footer />
            </div>
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
