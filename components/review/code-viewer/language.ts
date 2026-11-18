export function normalizeCodeLanguage(language?: string): string {
  const lang = (language || "python").toLowerCase().trim()
  if (lang === "py" || lang === "python") return "python"
  if (lang === "ts" || lang === "typescript") return "typescript"
  if (lang === "js" || lang === "javascript") return "javascript"
  if (lang === "tsx") return "tsx"
  if (lang === "jsx") return "jsx"
  if (lang === "go") return "go"
  if (lang === "rust" || lang === "rs") return "rust"
  if (lang === "java") return "java"
  return "python"
}

export function resolveCodeFileName(
  normalizedLanguage: string,
  explicitFileName?: string
): string {
  if (explicitFileName) return explicitFileName
  switch (normalizedLanguage) {
    case "python":
      return "solution.py"
    case "go":
      return "solution.go"
    case "rust":
      return "solution.rs"
    case "java":
      return "Solution.java"
    default:
      return "solution.ts"
  }
}
