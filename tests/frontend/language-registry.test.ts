import { describe, expect, it } from "vitest"
import rawManifest from "@/backend/models/languages.json"
import {
  CHALLENGE_LANGUAGES,
  formatLanguageLabel,
  formatSupportedLanguagesList,
  getRuntimeLabel,
  inferLanguageFromPath,
  isSupportedLanguage,
  normalizeCodeLanguage,
  resolveCodeFileName,
  SUPPORTED_LANGUAGE_IDS,
} from "@/lib/languages/registry"
import { CHALLENGE_LANGUAGE_IDS } from "@/types/challenge"

describe("language registry", () => {
  it("keeps CHALLENGE_LANGUAGE_IDS and manifest challengeLanguages in exact parity", () => {
    const manifestIds = rawManifest.challengeLanguages.map((entry) => entry.id)

    expect(SUPPORTED_LANGUAGE_IDS).toEqual(manifestIds)
    expect([...CHALLENGE_LANGUAGE_IDS]).toEqual(manifestIds)
    expect(CHALLENGE_LANGUAGES).toEqual(
      rawManifest.challengeLanguages.map((entry) => ({
        value: entry.id,
        label: entry.label,
      }))
    )
    expect(CHALLENGE_LANGUAGES).toContainEqual({ value: "csharp", label: "C#" })
  })

  it("validates supported challenge language IDs strictly", () => {
    for (const id of CHALLENGE_LANGUAGE_IDS) {
      expect(isSupportedLanguage(id)).toBe(true)
    }

    expect(isSupportedLanguage("c#")).toBe(false)
    expect(isSupportedLanguage("cs")).toBe(false)
    expect(isSupportedLanguage("javascript")).toBe(false)
    expect(isSupportedLanguage("ruby")).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
    expect(isSupportedLanguage(42)).toBe(false)
  })

  it("formats the human-readable supported languages list", () => {
    expect(formatSupportedLanguagesList()).toBe(
      "python, typescript, go, rust, java, or csharp"
    )
  })

  it("formats display labels across canonical IDs and aliases", () => {
    expect(formatLanguageLabel("csharp")).toBe("C#")
    expect(formatLanguageLabel("c#")).toBe("C#")
    expect(formatLanguageLabel("C#")).toBe("C#")
    expect(formatLanguageLabel("c-sharp")).toBe("C#")
    expect(formatLanguageLabel("cs")).toBe("C#")
    expect(formatLanguageLabel("dotnet")).toBe("C#")
    expect(formatLanguageLabel("py")).toBe("Python")
    expect(formatLanguageLabel("ts")).toBe("TypeScript")
    expect(formatLanguageLabel("golang")).toBe("Go")
    expect(formatLanguageLabel("rs")).toBe("Rust")
    expect(formatLanguageLabel("java")).toBe("Java")
    expect(formatLanguageLabel("elixir")).toBe("elixir")
  })

  it("returns exact-case runtime labels for challenge languages", () => {
    expect(getRuntimeLabel("csharp")).toBe(".NET 8 / C# 12")
    expect(getRuntimeLabel("c#")).toBe(".NET 8 / C# 12")
    expect(getRuntimeLabel("python")).toBe("Python 3.12")
    expect(getRuntimeLabel("typescript")).toBe("Node.js 22")
    expect(getRuntimeLabel("go")).toBe("Go 1.23")
    expect(getRuntimeLabel("rust")).toBe("Rust 1.82")
    expect(getRuntimeLabel("java")).toBe("Java 21")
    expect(getRuntimeLabel("unknown")).toBe("unknown")
  })

  it("infers syntax language from file paths including .cs files", () => {
    expect(inferLanguageFromPath("Services/InvoiceRepo.cs")).toBe("csharp")
    expect(inferLanguageFromPath("Program.CS")).toBe("csharp")
    expect(inferLanguageFromPath("src/app.py")).toBe("python")
    expect(inferLanguageFromPath("src/index.ts")).toBe("typescript")
    expect(inferLanguageFromPath("Main.java")).toBe("java")
    expect(inferLanguageFromPath("dir.v1/Makefile", "text")).toBe("text")
    expect(inferLanguageFromPath(undefined)).toBe("python")
  })

  it("normalizes code languages with default and markdown options", () => {
    for (const token of ["csharp", "c#", "C#", "c-sharp", "cs", "dotnet"]) {
      expect(normalizeCodeLanguage(token)).toBe("csharp")
      expect(
        normalizeCodeLanguage(token, {
          fallback: "text",
          preserveUnknown: true,
        })
      ).toBe("csharp")
    }

    expect(normalizeCodeLanguage(undefined)).toBe("python")
    expect(normalizeCodeLanguage("unknown-lang")).toBe("python")
    expect(
      normalizeCodeLanguage("", { fallback: "text", preserveUnknown: true })
    ).toBe("text")
    expect(
      normalizeCodeLanguage("diff", { fallback: "text", preserveUnknown: true })
    ).toBe("diff")
    expect(
      normalizeCodeLanguage("text", { fallback: "text", preserveUnknown: true })
    ).toBe("text")
  })

  it("resolves default code file names and honors explicit overrides", () => {
    expect(resolveCodeFileName("csharp")).toBe("Solution.cs")
    expect(resolveCodeFileName("java")).toBe("Solution.java")
    expect(resolveCodeFileName("python")).toBe("solution.py")
    expect(resolveCodeFileName("csharp", "Services/Billing.cs")).toBe(
      "Services/Billing.cs"
    )
    expect(resolveCodeFileName("unknown")).toBe("solution.ts")
  })
})
