# Unsanitized Autonomous Calculator Tool Execution

## Description
An autonomous agent framework includes a math calculation tool intended to evaluate arithmetic expressions returned during agent multi-step reasoning. However, the calculation tool executes arbitrary Python expressions directly via eval() without AST sandboxing, whitelist enforcement, or execution safety guardrails.

## Threat Model
Untrusted user input or compromised upstream agent outputs can supply malicious Python payloads (e.g. `__import__('os').system(...)` or filesystem inspection) to the calculator tool. Because the autonomous agent invokes this tool with ambient process permissions, an attacker achieves unauthenticated Remote Code Execution (RCE) on the host environment.
