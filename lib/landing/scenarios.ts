import type { SandboxScenario } from "@/lib/landing/sandbox-engine"

export const LANDING_SANDBOX_SCENARIOS: readonly [
  SandboxScenario,
  ...SandboxScenario[],
] = [
  {
    id: "race-condition-lock",
    codeLabel: "SCENARIO_01 // ASYNC_STATE",
    title: "Async Checkout Double-Charge Race",
    agentModelLabel: "Agent PR #412 · claude-code",
    language: "typescript",
    filePath: "services/billing/capture-intent.ts",
    prSummary:
      "Refactored payment capture handler to check idempotency cache before charging customer card.",
    challengeSlug: "nextjs-race-condition-useeffect",
    lines: [
      {
        lineNumber: 1,
        oldLineNumber: 42,
        newLineNumber: 42,
        kind: "context",
        content:
          "export async function captureInvoice(invoiceId: string, amountCents: number) {",
      },
      {
        lineNumber: 2,
        oldLineNumber: 43,
        newLineNumber: 43,
        kind: "context",
        content: "  const lockKey = `capture:lock:${invoiceId}`",
      },
      {
        lineNumber: 3,
        oldLineNumber: 44,
        newLineNumber: null,
        kind: "del",
        content:
          "  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 30)",
      },
      {
        lineNumber: 4,
        oldLineNumber: null,
        newLineNumber: 44,
        kind: "add",
        content: "  const alreadyLocked = await redis.get(lockKey)",
        defect: {
          id: "toctou-non-atomic-check",
          severity: "critical",
          category: "Concurrency / TOCTOU",
          title: "Non-Atomic Check-Then-Act Lock Read",
          explanation:
            "Replacing atomic SET NX with separate GET and SET calls opens a time-of-check to time-of-use race window. Concurrent webhook retries read null simultaneously and charge the card twice.",
          remediation:
            "Use a single atomic `SET key value NX EX 30` command and abort immediately when the result is null.",
          scoreWeight: 1.0,
        },
      },
      {
        lineNumber: 5,
        oldLineNumber: null,
        newLineNumber: 45,
        kind: "add",
        content: "  if (alreadyLocked) return { status: 'duplicate' as const }",
      },
      {
        lineNumber: 6,
        oldLineNumber: null,
        newLineNumber: 46,
        kind: "add",
        content: "  await redis.set(lockKey, '1', 'EX', 30)",
      },
      {
        lineNumber: 7,
        oldLineNumber: 46,
        newLineNumber: 47,
        kind: "context",
        content:
          "  const receipt = await stripeGateway.charge({ invoiceId, amountCents })",
      },
      {
        lineNumber: 8,
        oldLineNumber: 47,
        newLineNumber: 48,
        kind: "context",
        content:
          "  return { status: 'captured' as const, receiptId: receipt.id }",
      },
      {
        lineNumber: 9,
        oldLineNumber: 48,
        newLineNumber: 49,
        kind: "context",
        content: "}",
      },
    ],
  },
  {
    id: "sql-injection-sink",
    codeLabel: "SCENARIO_02 // INJECTION_SINK",
    title: "Raw SQL Sort Column Interpolation",
    agentModelLabel: "Agent PR #189 · cursor-agent",
    language: "python",
    filePath: "api/routes/audit_logs.py",
    prSummary:
      "Added dynamic column sorting and tenant filtering to the organization audit log endpoint.",
    challengeSlug: "fastapi-raw-sql-injection",
    lines: [
      {
        lineNumber: 1,
        oldLineNumber: 18,
        newLineNumber: 18,
        kind: "context",
        content:
          "def list_tenant_events(session: Session, tenant_id: str, sort_by: str = 'created_at'):",
      },
      {
        lineNumber: 2,
        oldLineNumber: 19,
        newLineNumber: 19,
        kind: "context",
        content: "    params = {'tenant_id': tenant_id}",
      },
      {
        lineNumber: 3,
        oldLineNumber: 20,
        newLineNumber: null,
        kind: "del",
        content:
          "    stmt = text('SELECT id, actor, action FROM audit_logs WHERE tenant_id = :tenant_id')",
      },
      {
        lineNumber: 4,
        oldLineNumber: null,
        newLineNumber: 20,
        kind: "add",
        content:
          "    query = f'SELECT id, actor, action FROM audit_logs WHERE tenant_id = :tenant_id ORDER BY {sort_by} DESC'",
        defect: {
          id: "order-by-sqli-interpolation",
          severity: "critical",
          category: "Security / SQL Injection",
          title: "Unvalidated f-String Interpolation in ORDER BY Clause",
          explanation:
            "Binding `:tenant_id` protects the WHERE parameter, but interpolating `sort_by` directly into the SQL string lets an attacker inject stacked expressions or boolean blind subqueries after ORDER BY.",
          remediation:
            "Validate `sort_by` against a strict allowlist map of column objects before constructing the statement.",
          scoreWeight: 1.0,
        },
      },
      {
        lineNumber: 5,
        oldLineNumber: null,
        newLineNumber: 21,
        kind: "add",
        content:
          "    rows = session.execute(text(query), params).mappings().all()",
      },
      {
        lineNumber: 6,
        oldLineNumber: 22,
        newLineNumber: 22,
        kind: "context",
        content: "    return [dict(row) for row in rows]",
      },
    ],
  },
  {
    id: "prompt-injection-pipeline",
    codeLabel: "SCENARIO_03 // AGENT_TOOL_RCE",
    title: "Unsanitized Agent Expression Evaluator",
    agentModelLabel: "Agent PR #804 · codex-agent",
    language: "python",
    filePath: "backend/agents/math_tool.py",
    prSummary:
      "Optimized autonomous agent arithmetic tool by replacing AST visitor with direct expression evaluation.",
    challengeSlug: "agent-unsanitized-exec",
    lines: [
      {
        lineNumber: 1,
        oldLineNumber: 11,
        newLineNumber: 11,
        kind: "context",
        content: "def run_calculator_tool(expression: str) -> float:",
      },
      {
        lineNumber: 2,
        oldLineNumber: 12,
        newLineNumber: 12,
        kind: "context",
        content: "    cleaned = expression.strip()",
      },
      {
        lineNumber: 3,
        oldLineNumber: 13,
        newLineNumber: null,
        kind: "del",
        content:
          "    return float(safe_ast_eval(ast.parse(cleaned, mode='eval')))",
      },
      {
        lineNumber: 4,
        oldLineNumber: null,
        newLineNumber: 13,
        kind: "add",
        content:
          "    result = eval(cleaned, {'__builtins__': {}}, {'math': math})",
        defect: {
          id: "eval-sandbox-escape-rce",
          severity: "critical",
          category: "Agent Antipatterns / RCE",
          title: "Arbitrary Code Execution via Python eval() Gadget Chain",
          explanation:
            "Passing `{'__builtins__': {}}` does not sandbox Python `eval()`. Untrusted LLM tool arguments can traverse `().__class__.__base__.__subclasses__()` to recover `os.popen` and execute arbitrary shell commands.",
          remediation:
            "Parse with `ast.parse(cleaned, mode='eval')` and restrict AST nodes to numeric literals and arithmetic operators.",
          scoreWeight: 1.0,
        },
      },
      {
        lineNumber: 5,
        oldLineNumber: null,
        newLineNumber: 14,
        kind: "add",
        content: "    return float(result)",
      },
    ],
  },
]
