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

    await user.click(screen.getByTestId("ai-provider-select"))
    await user.click(await screen.findByRole("option", { name: "Anthropic" }))
    expect(screen.getByTestId("ai-model-input")).toHaveValue(
      "claude-sonnet-4-5"
    )
    expect(screen.getByTestId("ai-base-url-input")).toHaveValue("")

    await user.click(screen.getByTestId("ai-provider-select"))
    await user.click(
      await screen.findByRole("option", { name: "OpenAI-compatible" })
    )
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

    await user.click(screen.getByTestId("ai-suggested-model-gemini-2.5-pro"))
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gemini-2.5-pro")

    resolveFetch({
      connected: true,
      provider: "openai",
      model: "gpt-4.1-mini",
      maskedKey: "sk-p••••9999",
    })

    expect(
      await screen.findByTestId("ai-connection-status-badge")
    ).toHaveTextContent("Connected: OpenAI (gpt-4.1-mini)")
    expect(screen.getByTestId("ai-provider-select")).toHaveTextContent(
      "Google Gemini"
    )
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gemini-2.5-pro")
  })
})
