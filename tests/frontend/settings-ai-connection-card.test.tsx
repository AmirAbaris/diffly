import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SettingsAIConnectionCard } from "@/components/account/settings-gemini-card"

describe("SettingsAIConnectionCard", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("surfaces initial GET /api/ai/connection errors in the error banner", async () => {
    const fetcher = vi.fn(async (key: string) => {
      if (key === "/api/ai/connection") {
        throw new Error("Connection status service unavailable")
      }
      return null
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsAIConnectionCard />
      </SWRConfig>
    )

    expect(await screen.findByTestId("ai-connection-error")).toHaveTextContent(
      "Connection status service unavailable"
    )
  })

  it("renders all 4 provider logo cards, updates default model when switching providers, and displays the security trust explanation", async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn(async () => ({ connected: false }))

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsAIConnectionCard />
      </SWRConfig>
    )

    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(4)
    expect(screen.getByTestId("ai-provider-logo-google")).toBeInTheDocument()
    expect(screen.getByTestId("ai-provider-logo-openai")).toBeInTheDocument()
    expect(screen.getByTestId("ai-provider-logo-anthropic")).toBeInTheDocument()
    expect(
      screen.getByTestId("ai-provider-logo-openai-compatible")
    ).toBeInTheDocument()

    expect(screen.getByTestId("ai-provider-option-google")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "gemini-3.1-flash-lite"
    )

    await user.click(screen.getByTestId("ai-provider-option-openai"))
    expect(screen.getByTestId("ai-provider-option-openai")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gpt-6.2-sol")

    await user.click(screen.getByTestId("ai-provider-option-anthropic"))
    expect(screen.getByTestId("ai-provider-option-anthropic")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "claude-sonnet-5-5"
    )

    await user.click(screen.getByTestId("ai-provider-option-openai-compatible"))
    expect(
      screen.getByTestId("ai-provider-option-openai-compatible")
    ).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId("ai-model-input")).toHaveValue("deepseek-chat")

    expect(screen.getByTestId("ai-api-key-encrypted-badge")).toHaveTextContent(
      "Encrypted"
    )
    const trustBox = screen.getByTestId("ai-privacy-notice")
    expect(trustBox).toHaveTextContent(
      "Your API key is encrypted and never stored in our database"
    )
    expect(trustBox).toHaveTextContent(/AES-256-GCM/i)
    expect(trustBox).toHaveTextContent(/Never written to PostgreSQL/i)
  })

  it("restores saved model and baseUrl when re-selecting the active connected provider", async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn(async (key: string) => {
      if (key === "/api/ai/connection") {
        return {
          connected: true,
          provider: "openai-compatible",
          model: "llama-3.3-70b-versatile",
          baseUrl: "https://api.groq.com/openai/v1",
          maskedKey: "gsk_••••9999",
        }
      }
      return null
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsAIConnectionCard />
      </SWRConfig>
    )

    expect(
      await screen.findByTestId("ai-connection-status-badge")
    ).toHaveTextContent("OpenAI-compatible (llama-3.3-70b-versatile)")
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "llama-3.3-70b-versatile"
    )
    expect(screen.getByTestId("ai-base-url-input")).toHaveValue(
      "https://api.groq.com/openai/v1"
    )
    expect(
      screen.getByTestId("ai-provider-connected-dot-openai-compatible")
    ).toBeInTheDocument()

    await user.click(screen.getByTestId("ai-provider-option-anthropic"))
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "claude-sonnet-5-5"
    )
    expect(screen.getByTestId("ai-base-url-input")).toHaveValue("")

    await user.click(screen.getByTestId("ai-provider-option-openai-compatible"))
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "llama-3.3-70b-versatile"
    )
    expect(screen.getByTestId("ai-base-url-input")).toHaveValue(
      "https://api.groq.com/openai/v1"
    )
  })

  it("pins draftProvider when editing model before initial SWR load resolves", async () => {
    const user = userEvent.setup()
    let resolveFetch!: (value: unknown) => void
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsAIConnectionCard />
      </SWRConfig>
    )

    await user.click(screen.getByTestId("ai-suggested-model-gemini-3.5-flash"))
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gemini-3.5-flash")

    resolveFetch({
      connected: true,
      provider: "openai",
      model: "gpt-6.2-sol",
      maskedKey: "sk-p••••9999",
    })

    expect(
      await screen.findByTestId("ai-connection-status-badge")
    ).toHaveTextContent("Connected: OpenAI (gpt-6.2-sol)")
    expect(screen.getByTestId("ai-provider-option-google")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gemini-3.5-flash")
  })
})
