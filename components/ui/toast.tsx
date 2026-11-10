"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Toast as ToastPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function ToastProvider({
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "pointer-events-none fixed right-0 bottom-16 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-auto sm:right-4 sm:bottom-16 sm:max-w-[380px] sm:flex-col",
        className
      )}
      {...props}
    />
  )
}

interface ToastProps extends React.ComponentProps<typeof ToastPrimitive.Root> {
  variant?: "default" | "destructive" | "success"
}

function Toast({ className, variant = "default", ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group pointer-events-auto relative flex w-full items-start justify-between space-x-3 overflow-hidden rounded-xl border p-4 pr-9 shadow-xl backdrop-blur-md transition-all duration-200",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full data-[swipe=end]:animate-out sm:data-[state=open]:slide-in-from-bottom-full",
        variant === "default" &&
          "border-border bg-card/95 text-foreground shadow-lg",
        variant === "destructive" &&
          "border-destructive/40 bg-zinc-950/95 text-destructive shadow-lg dark:border-destructive/50",
        variant === "success" &&
          "border-emerald-500/40 bg-zinc-950/95 text-foreground shadow-lg dark:border-emerald-500/40",
        className
      )}
      {...props}
    />
  )
}

function ToastAction({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-muted focus:ring-1 focus:ring-ring focus:outline-none disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function ToastClose({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      className={cn(
        "absolute top-2 right-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus:opacity-100 focus:ring-1 focus:outline-none",
        className
      )}
      toast-close=""
      aria-label="Close notification"
      {...props}
    >
      <X className="size-3.5" />
    </ToastPrimitive.Close>
  )
}

function ToastTitle({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      className={cn("text-xs font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      className={cn(
        "line-clamp-3 text-xs leading-relaxed break-words text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
