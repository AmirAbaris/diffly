import type { Language } from "@/types/challenge"

export interface ConfigureChallengeTopicOption {
  label: string
  topic: string
  rationale?: string
}

export const DEFAULT_TOPICS_BY_LANGUAGE: Record<
  Language,
  readonly ConfigureChallengeTopicOption[]
> = {
  python: [
    {
      label: "FastAPI JWT auth bypass",
      topic: "JWT signature and algorithm confusion in FastAPI auth middleware",
      rationale: "Common high-impact security blind spot in Python APIs.",
    },
    {
      label: "Asyncio lock race",
      topic: "Shared mutable state race condition across asyncio await points",
      rationale: "Builds recall for subtle async concurrency bugs.",
    },
    {
      label: "SQL query injection",
      topic: "String-interpolated SQL filter clauses in repository helpers",
      rationale: "Sharpens detection of unsafe query construction.",
    },
  ],
  typescript: [
    {
      label: "Async cache race",
      topic:
        "Stale read-modify-write race condition in async cache invalidation",
      rationale:
        "Targets subtle concurrency defects in Node/TypeScript services.",
    },
    {
      label: "Prototype pollution",
      topic: "Unsafe deep object merge leading to prototype pollution",
      rationale: "High-severity security flaw often missed in utility code.",
    },
    {
      label: "SSRF URL validation",
      topic:
        "Incomplete outbound URL allowlist allowing internal SSRF requests",
      rationale: "Exercises boundary validation review habits.",
    },
  ],
  go: [
    {
      label: "Mutex unlock leak",
      topic: "Missing deferred mutex unlock on early error return path",
      rationale: "Classic Go concurrency defect causing silent deadlocks.",
    },
    {
      label: "Goroutine leak",
      topic: "Unbuffered channel send blocking goroutines after context cancel",
      rationale: "Builds skill spotting cancellation and resource leaks.",
    },
    {
      label: "Slice aliasing bug",
      topic: "Shared backing array mutation across concurrent slice appends",
      rationale: "Catches subtle data corruption in Go services.",
    },
  ],
  rust: [
    {
      label: "Lock across await",
      topic: "Holding a std MutexGuard across an async await boundary",
      rationale: "Key async Rust concurrency pitfall in Tokio services.",
    },
    {
      label: "Integer overflow panic",
      topic: "Unchecked arithmetic on untrusted length headers causing panic",
      rationale: "Focuses on boundary safety and DoS resilience.",
    },
    {
      label: "Path traversal check",
      topic: "Incomplete canonical path validation in static file handler",
      rationale: "Sharpens security review on filesystem boundaries.",
    },
  ],
  java: [
    {
      label: "Double-checked locking",
      topic: "Broken double-checked locking missing volatile on lazy singleton",
      rationale: "Targets memory visibility issues in concurrent Java code.",
    },
    {
      label: "Resource stream leak",
      topic: "Unclosed JDBC statement and connection on exception branch",
      rationale: "Builds precision on resource lifecycle reviews.",
    },
    {
      label: "Deserialization flaw",
      topic: "Unsafe object deserialization of untrusted request payload",
      rationale: "High-severity security pattern in Java backends.",
    },
  ],
  csharp: [
    {
      label: "EF Core FromSqlRaw injection",
      topic:
        "SQL injection from interpolated strings passed to EF Core FromSqlRaw",
      rationale:
        "String interpolation bypasses FormattableString parameterization on FromSqlRaw.",
    },
    {
      label: "Scoped DbContext concurrency",
      topic:
        "Shared scoped EF Core DbContext across Task.WhenAll parallel queries",
      rationale:
        "DbContext is not thread-safe and throws under concurrent async operations.",
    },
    {
      label: "Newtonsoft TypeNameHandling RCE",
      topic:
        "Unsafe TypeNameHandling deserialization without SerializationBinder allowlist",
      rationale:
        "Untrusted $type payloads enable arbitrary .NET gadget instantiation.",
    },
  ],
}

export const GENERAL_DEFAULT_TOPICS: readonly ConfigureChallengeTopicOption[] =
  [
    {
      label: "Auth & token validation",
      topic: "Authentication bypass via missing signature or role verification",
      rationale: "High-signal security review across any backend stack.",
    },
    {
      label: "Async race conditions",
      topic: "Concurrent read-modify-write race condition on shared state",
      rationale: "Builds recall for timing-sensitive concurrency defects.",
    },
    {
      label: "Input boundary flaws",
      topic: "Missing input validation enabling injection or path traversal",
      rationale: "Core defensive review habit for production endpoints.",
    },
  ]
