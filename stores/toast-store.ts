import type * as React from "react"
import { create } from "zustand"

export const TOAST_LIMIT = 5
export const TOAST_REMOVE_DELAY = 5000

export type ToastVariant = "default" | "destructive" | "success"

export interface ToastProps {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactElement
  variant?: ToastVariant
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface ToastOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactElement
  variant?: ToastVariant
}

export interface ToastState {
  toasts: ToastProps[]
  addToast: (toast: ToastProps) => void
  updateToast: (toast: Partial<ToastProps> & { id: string }) => void
  dismissToast: (toastId?: string) => void
  removeToast: (toastId?: string) => void
  clearToasts: () => void
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (
  toastId: string,
  removeToast: (id?: string) => void
) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    removeToast(toastId)
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (newToast: ToastProps) => {
    set((state) => ({
      toasts: [newToast, ...state.toasts].slice(0, TOAST_LIMIT),
    }))
  },

  updateToast: (updatedToast: Partial<ToastProps> & { id: string }) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === updatedToast.id ? { ...t, ...updatedToast } : t
      ),
    }))
  },

  dismissToast: (toastId?: string) => {
    const { toasts, removeToast } = get()

    if (toastId) {
      addToRemoveQueue(toastId, removeToast)
    } else {
      toasts.forEach((t) => addToRemoveQueue(t.id, removeToast))
    }

    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === toastId || toastId === undefined ? { ...t, open: false } : t
      ),
    }))
  },

  removeToast: (toastId?: string) => {
    set((state) => ({
      toasts:
        toastId === undefined
          ? []
          : state.toasts.filter((t) => t.id !== toastId),
    }))
  },

  clearToasts: () => {
    set({ toasts: [] })
  },
}))

export function toast(options: ToastOptions) {
  const id = genId()
  const store = useToastStore.getState()

  const dismiss = () => store.dismissToast(id)
  const update = (patch: Partial<ToastProps>) =>
    store.updateToast({ ...patch, id })

  store.addToast({
    ...options,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss()
    },
  })

  return {
    id,
    dismiss,
    update,
  }
}
