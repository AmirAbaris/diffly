export function inferLanguageFromPath(
  filePath?: string,
  fallback = "python"
): string {
  if (!filePath) return fallback
  const dotIdx = filePath.lastIndexOf(".")
  if (dotIdx === -1) return fallback
  const ext = filePath.slice(dotIdx + 1).toLowerCase()
  switch (ext) {
    case "py":
    case "pyw":
      return "python"
    case "ts":
      return "typescript"
    case "tsx":
      return "tsx"
    case "js":
      return "javascript"
    case "jsx":
      return "jsx"
    case "go":
      return "go"
    case "rs":
      return "rust"
    case "java":
      return "java"
    case "sql":
      return "sql"
    case "yaml":
    case "yml":
      return "yaml"
    case "json":
      return "json"
    case "sh":
    case "bash":
      return "bash"
    default:
      return fallback
  }
}

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
  if (lang === "sql") return "sql"
  if (lang === "yaml" || lang === "yml") return "yaml"
  if (lang === "json") return "json"
  if (lang === "sh" || lang === "bash" || lang === "shell") return "bash"
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
