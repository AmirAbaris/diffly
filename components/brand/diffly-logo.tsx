import * as React from "react"
import { cn } from "@/lib/utils"

export interface DifflyLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  decorative?: boolean
}

export function DifflyLogo({
  className,
  decorative = true,
  ...props
}: DifflyLogoProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden={decorative ? true : undefined}
      className={cn("size-4 shrink-0 text-foreground", className)}
      {...props}
    >
      <rect x="1" y="1" width="2" height="8" />
      <rect x="3" y="1" width="4" height="2" />
      <rect x="3" y="7" width="4" height="2" />
      <rect x="7" y="3" width="2" height="4" />
      <rect x="4" y="4" width="2" height="2" opacity={0.42} />
    </svg>
  )
}
