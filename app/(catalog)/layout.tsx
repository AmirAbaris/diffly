import * as React from "react"
import { Footer } from "@/components/layout/footer"
import { Header } from "@/components/layout/header"
import { Separator } from "@/components/ui/separator"

export default function CatalogLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <Separator />
      <div className="flex-1">{children}</div>
      <Separator />
      <Footer />
    </div>
  )
}
