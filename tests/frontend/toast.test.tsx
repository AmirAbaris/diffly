import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Toaster } from "@/components/ui/toaster"
import { useToastStore } from "@/stores/toast-store"

const mockLogin = vi.fn()
const mockRegister = vi.fn()

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: mockLogin,
    register: mockRegister,
    logout: vi.fn(),
  }),
}))

describe("Toast Component", () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts()
    mockLogin.mockReset()
    mockRegister.mockReset()
  })

  afterEach(() => {
    useToastStore.getState().clearToasts()
    cleanup()
    vi.clearAllMocks()
  })

  it.each(["default", "success", "destructive"] as const)(
    "renders %s variant with theme-aware bg-card/95 surface and no hardcoded dark bg-zinc-950 class",
    (variant) => {
      render(
        <ToastProvider>
          <Toast open={true} variant={variant} data-testid={`toast-${variant}`}>
            <div className="grid gap-1">
              <ToastTitle>Status title</ToastTitle>
              <ToastDescription>Status description</ToastDescription>
            </div>
          </Toast>
          <ToastViewport />
        </ToastProvider>
      )

      const toastElement = screen.getByTestId(`toast-${variant}`)
      expect(toastElement).toBeInTheDocument()
      expect(toastElement.className).toContain("bg-card/95")
      expect(toastElement.className).not.toContain("bg-zinc-950")

      const title = screen.getByText("Status title")
      const description = screen.getByText("Status description")
      expect(title.className).toContain("text-foreground")
      expect(description.className).toContain("text-muted-foreground")

      if (variant === "destructive") {
        expect(toastElement.className).toContain("text-destructive")
      } else {
        expect(toastElement.className).toContain("text-foreground")
      }
    }
  )

  it("renders success toast with bg-card/95 and without bg-zinc-950 on SignInForm success", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()

    mockLogin.mockResolvedValueOnce({
      id: "user-1",
      username: "alex",
      email: "alex@diffly.dev",
    })

    render(
      <>
        <SignInForm onSuccess={onSuccess} onError={onError} />
        <Toaster />
      </>
    )

    await user.type(screen.getByTestId("login-identifier-input"), "alex")
    await user.type(screen.getByTestId("login-password-input"), "secret123")
    await user.click(screen.getByTestId("sign-in-submit-button"))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    expect(onError).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Signed in successfully",
          variant: "success",
        }),
      ])
    )

    const titleEl = await screen.findByText("Signed in successfully")
    const toastRoot = titleEl.closest('[data-slot="toast"]')
    expect(toastRoot).not.toBeNull()
    expect(toastRoot?.className).toContain("bg-card/95")
    expect(toastRoot?.className).not.toContain("bg-zinc-950")
  })

  it("renders success toast with bg-card/95 and without bg-zinc-950 on SignUpForm success", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()

    mockRegister.mockResolvedValueOnce({
      id: "user-2",
      username: "dev_reviewer",
      email: "dev@diffly.dev",
    })

    render(
      <>
        <SignUpForm onSuccess={onSuccess} onError={onError} />
        <Toaster />
      </>
    )

    await user.type(
      screen.getByTestId("register-email-input"),
      "dev@diffly.dev"
    )
    await user.type(
      screen.getByTestId("register-username-input"),
      "dev_reviewer"
    )
    await user.type(screen.getByTestId("register-password-input"), "secret123")
    await user.type(
      screen.getByTestId("register-confirm-password-input"),
      "secret123"
    )
    await user.click(screen.getByTestId("sign-up-submit-button"))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    expect(onError).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Account created",
          variant: "success",
        }),
      ])
    )

    const titleEl = await screen.findByText("Account created")
    const toastRoot = titleEl.closest('[data-slot="toast"]')
    expect(toastRoot).not.toBeNull()
    expect(toastRoot?.className).toContain("bg-card/95")
    expect(toastRoot?.className).not.toContain("bg-zinc-950")
  })
})
