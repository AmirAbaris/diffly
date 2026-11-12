/* oxlint-disable no-console, no-underscore-dangle */
import "@testing-library/jest-dom/vitest"
import { createRequire } from "node:module"
import path from "node:path"
import { vi } from "vitest"

// Unify React instances across pnpm virtual store peer dependency hardlinks
const require = createRequire(import.meta.url)
const Module = require("module")
const originalResolveFilename = Module._resolveFilename

const canonicalReact = path.dirname(require.resolve("react/package.json"))
const canonicalReactDom = path.dirname(
  require.resolve("react-dom/package.json")
)

Module._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
) {
  if (request === "react") {
    return path.join(canonicalReact, "index.js")
  }
  if (request.startsWith("react/")) {
    const subpath = request.slice("react/".length)
    return path.join(canonicalReact, `${subpath}.js`)
  }
  if (request === "react-dom") {
    return path.join(canonicalReactDom, "index.js")
  }
  if (request.startsWith("react-dom/")) {
    const subpath = request.slice("react-dom/".length)
    return path.join(canonicalReactDom, `${subpath}.js`)
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Polyfill window.matchMedia for responsive components and next-themes
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Polyfill ResizeObserver for Radix UI dialog / tabs
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Polyfill scrollIntoView and PointerCapture
window.HTMLElement.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
window.HTMLElement.prototype.setPointerCapture = vi.fn()
window.HTMLElement.prototype.releasePointerCapture = vi.fn()

// Mock next-themes for consistent light/dark testing
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: unknown }) => children,
}))

// Configure clipboard mock
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    writable: true,
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(""),
    },
  })
}

// Suppress known React 19 + Testing Library synchronous render() act() transition notice
const originalError = console.error
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("inside a test was not wrapped in act(...)")
  ) {
    return
  }
  originalError.call(console, ...args)
}
