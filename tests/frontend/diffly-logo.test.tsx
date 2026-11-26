import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import * as React from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DifflyLogo } from "@/components/brand/diffly-logo"

const NEXT_DEFAULT_FAVICON_SHA256 =
  "2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932"

function readIcoDimensions(buffer: Buffer): Array<[number, number]> {
  const count = buffer.readUInt16LE(4)
  const sizes: Array<[number, number]> = []

  for (let i = 0; i < count; i += 1) {
    const offset = 6 + i * 16
    const width = buffer.readUInt8(offset) || 256
    const height = buffer.readUInt8(offset + 1) || 256
    sizes.push([width, height])
  }

  return sizes
}

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

  it("ships Diffly favicon assets instead of the default Next.js icon", () => {
    const repoRoot = process.cwd()
    const favicon = readFileSync(path.join(repoRoot, "app/favicon.ico"))
    const iconSvg = readFileSync(path.join(repoRoot, "app/icon.svg"), "utf8")

    expect(favicon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    expect(readIcoDimensions(favicon)).toEqual(
      expect.arrayContaining([
        [16, 16],
        [32, 32],
      ])
    )

    const digest = createHash("sha256").update(favicon).digest("hex")
    expect(digest).not.toBe(NEXT_DEFAULT_FAVICON_SHA256)

    expect(iconSvg).toContain('viewBox="0 0 10 10"')
    expect(iconSvg.match(/<rect\b/g)).toHaveLength(5)
  })
})
