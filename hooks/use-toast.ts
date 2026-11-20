"use client"

import {
  useToastStore,
  toast,
  TOAST_LIMIT,
  TOAST_REMOVE_DELAY,
  type ToastProps,
  type ToastVariant,
  type ToastOptions,
  type ToastState,
} from "@/stores/toast-store"

export function useToast() {
  const toasts = useToastStore((state: ToastState) => state.toasts)
  const dismiss = useToastStore((state: ToastState) => state.dismissToast)

  return {
    toasts,
    toast,
    dismiss,
  }
}

export { toast, useToastStore, TOAST_LIMIT, TOAST_REMOVE_DELAY }
export type { ToastProps, ToastVariant, ToastOptions, ToastState }
