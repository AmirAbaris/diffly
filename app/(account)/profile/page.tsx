import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { ProfileView } from "@/components/account/profile-view"

export const metadata: Metadata = {
  title: "Profile",
  description:
    "View your Diffly reviewer profile, GitHub link status, and category mastery summary.",
}

export const instant = false

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileView />
    </Suspense>
  )
}
