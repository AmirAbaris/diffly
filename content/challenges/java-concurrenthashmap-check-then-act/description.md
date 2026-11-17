# Non-Atomic Check-Then-Act Race on ConcurrentHashMap

## Description

A payment webhook processor deduplicates incoming transfer events using an in-memory `ConcurrentHashMap<String, ProcessingResult>`. When `handleTransferWebhook` receives an event, it checks whether `idempotencyKey` already exists in `processedEvents`, invokes `ledger.settleTransfer(...)` if absent, and stores the resulting `ProcessingResult`.

## Threat Model

Payment providers frequently retry webhooks concurrently across multiple HTTP worker threads. Because `containsKey()`, `get()`, and `put()` are only individually thread-safe, two threads arriving together with the same `idempotencyKey` can both see `containsKey == false`, both invoke `ledger.settleTransfer()`, and cause duplicate financial settlements (CWE-362).
