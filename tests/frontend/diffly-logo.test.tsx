import * as React from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DifflyLogo } from "@/components/brand/diffly-logo"

describe("DifflyLogo", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the 5 pixel rects and aria-hidden='true' by default", () => {
    const { container } = render(<DifflyLogo />)
    const svg = container.querySelector("svg")

    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg).toHaveAttribute("viewBox", "0 0 10 10")
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges")

    const rects = container.querySelectorAll("rect")
    expect(rects).toHaveLength(5)
    expect(rects[4]).toHaveAttribute("opacity", "0.42")
  })

  it("omits aria-hidden when decorative is false", () => {
    const { container } = render(
      <DifflyLogo decorative={false} role="img" aria-label="Diffly logo" />
    )
    const svg = container.querySelector("svg")

    expect(svg).not.toHaveAttribute("aria-hidden")
    expect(svg).toHaveAttribute("aria-label", "Diffly logo")
  })
})
