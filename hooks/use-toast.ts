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

// Backwards-compatible reducer helper for legacy tests or consumers
export function reducer(
  state: { toasts: ToastProps[] },
  action:
    | { type: "ADD_TOAST"; toast: ToastProps }
    | { type: "UPDATE_TOAST"; toast: Partial<ToastProps> }
    | { type: "DISMISS_TOAST"; toastId?: string }
    | { type: "REMOVE_TOAST"; toastId?: string }
): { toasts: ToastProps[] } {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }
    case "DISMISS_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return { ...state, toasts: [] }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

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
