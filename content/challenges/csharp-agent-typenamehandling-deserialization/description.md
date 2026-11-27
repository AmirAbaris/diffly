# Unsafe TypeNameHandling Deserialization in Agent Memory Store

## Description

An AI agent runtime persists and restores multi-step execution checkpoints containing heterogeneous `ToolOutputEntry` payloads (`object? Payload`). To preserve polymorphic runtime types across restarts, `AgentCheckpointSerializer` configures `Newtonsoft.Json` with `TypeNameHandling.Auto` and `MetadataPropertyHandling.ReadAhead`, alongside a 512 KB size cap and `MaxDepth = 32`.

## Threat Model

Checkpoints stored in shared Redis/object storage or poisoned by untrusted tool outputs can contain attacker-controlled JSON. With `TypeNameHandling.Auto` enabled and no restrictive `ISerializationBinder` allowlist, an attacker can inject a `$type` property inside `Payload` to instantiate arbitrary .NET gadget classes during deserialization—achieving Remote Code Execution (RCE) before any post-deserialization type check runs (CWE-502).
