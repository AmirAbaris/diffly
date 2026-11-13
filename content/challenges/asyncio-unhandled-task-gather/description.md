# Unhandled Concurrency Exceptions in asyncio.gather Multi-Agent Pipeline

## Description
A multi-agent review orchestration pipeline runs multiple specialized analyzer agents (linter, security scanner, type checker) concurrently using `asyncio.gather`. However, the orchestrator does not pass `return_exceptions=True` and lacks task cancellation logic for remaining tasks when one fails.

## Threat Model
If any sub-agent raises an unhandled network error or parsing timeout, `asyncio.gather` immediately raises the exception to the caller. The remaining coroutines continue executing as orphaned background tasks consuming CPU, memory, and database connections without any mechanism to collect their results or abort operations.
