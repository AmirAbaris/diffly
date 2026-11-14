import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "function", next: "function" },
        { blankLine: "always", prev: "class", next: "class" },
        {
          blankLine: "always",
          prev: "import",
          next: ["const", "let", "var", "function", "class", "export"],
        },
      ],
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
      "max-lines": [
        "error",
        { max: 350, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["components/**/*.{ts,tsx,js,jsx}", "app/**/*.{ts,tsx,js,jsx}"],
    ignores: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "content/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(?:^|[^&\\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b|\\b(?:rgba?|hsla?|oklch|oklab)\\s*\\(|\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|accent|caret|decoration|divide|placeholder)-\\[color:/]",
          message:
            'Raw color literals and arbitrary color classes are disallowed. Use semantic design tokens and shadcn CSS variables from app/globals.css (e.g. bg-background, text-foreground, border-border). See the "Diffly Design Language" section in .agents/rules/design-work.md.',
        },
        {
          selector:
            "TemplateElement[value.raw=/(?:^|[^&\\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b|\\b(?:rgba?|hsla?|oklch|oklab)\\s*\\(|\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|accent|caret|decoration|divide|placeholder)-\\[color:/]",
          message:
            'Raw color literals and arbitrary color classes are disallowed. Use semantic design tokens and shadcn CSS variables from app/globals.css (e.g. bg-background, text-foreground, border-border). See the "Diffly Design Language" section in .agents/rules/design-work.md.',
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".venv/**",
    ".ruff_cache/**",
    "content/**",
  ]),
])

export default eslintConfig
