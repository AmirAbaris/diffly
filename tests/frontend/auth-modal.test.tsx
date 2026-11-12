import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthModal } from "@/components/auth/auth-modal"
import { useAuthModalStore } from "@/stores/auth-modal-store"

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

describe("AuthModal Component", () => {
  beforeEach(() => {
    useAuthModalStore.setState({ isOpen: false, initialTab: "signin" })
    mockLogin.mockReset()
    mockRegister.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders nothing visible when closed in controlled mode", () => {
    render(<AuthModal open={false} />)
    expect(screen.queryByTestId("auth-modal-content")).not.toBeInTheDocument()
  })

  it("renders modal dialog with sign-in tab active by default", async () => {
    render(<AuthModal open={true} />)

    expect(await screen.findByTestId("auth-modal-content")).toBeInTheDocument()
    expect(screen.getByText("Diffly Account")).toBeInTheDocument()
    expect(
      screen.getByText(/Sign in or create an account/i)
    ).toBeInTheDocument()

    // Sign in tab should be active
    const signInTab = screen.getByTestId("auth-tab-signin")
    expect(signInTab).toHaveAttribute("data-state", "active")
    expect(
      screen.getByRole("button", { name: /^sign in$/i })
    ).toBeInTheDocument()
  })

  it("switches to sign-up tab on click", async () => {
    const user = userEvent.setup()
    render(<AuthModal open={true} />)

    const signUpTab = await screen.findByTestId("auth-tab-signup")
    await user.click(signUpTab)

    expect(signUpTab).toHaveAttribute("data-state", "active")
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument()
  })

  it("supports initialTab prop to open directly on signup", async () => {
    render(<AuthModal open={true} initialTab="signup" />)

    const signUpTab = await screen.findByTestId("auth-tab-signup")
    expect(signUpTab).toHaveAttribute("data-state", "active")
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument()
  })

  it("integrates with useAuthModalStore in uncontrolled mode", async () => {
    useAuthModalStore.setState({ isOpen: true, initialTab: "signup" })

    render(<AuthModal />)

    expect(await screen.findByTestId("auth-modal-content")).toBeInTheDocument()
    const signUpTab = screen.getByTestId("auth-tab-signup")
    expect(signUpTab).toHaveAttribute("data-state", "active")
  })

  it("displays validation error banner on authentication error", async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials."))
    render(<AuthModal open={true} />)

    const identifierInput = await screen.findByTestId("login-identifier-input")
    const passwordInput = screen.getByTestId("login-password-input")
    await user.type(identifierInput, "alex")
    await user.type(passwordInput, "wrongpassword")

    const submitBtn = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitBtn)

    const errorBanner = await screen.findByTestId("auth-error-banner")
    expect(errorBanner).toBeInTheDocument()
    expect(screen.getByText("Invalid credentials.")).toBeInTheDocument()
  })

  it("calls onOpenChange when closed", async () => {
    const onOpenChangeMock = vi.fn()
    const user = userEvent.setup()

    render(<AuthModal open={true} onOpenChange={onOpenChangeMock} />)

    const closeButton = await screen.findByRole("button", { name: /close/i })
    await user.click(closeButton)

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
  })
})
