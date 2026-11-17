# Unsafe ObjectInputStream Deserialization in Agent Checkpoint

## Description

An autonomous agent runtime persists and restores multi-turn session checkpoints (`sessionId`, `activeGoal`, `toolHistory`, and `scratchpad`) using Base64-encoded Java `Serializable` objects stored in an external `CheckpointBackend`. Before returning the restored state, `restoreSession` verifies the deserialized object with `instanceof AgentSessionState`.

## Threat Model

If an attacker poisons the checkpoint backend (via Redis access, SSRF, or forged session tokens), `ObjectInputStream.readObject()` instantiates arbitrary classes present on the JVM classpath before the `instanceof AgentSessionState` check runs. Without an `ObjectInputFilter` allowlist—or safer JSON serialization—crafted gadget chains execute arbitrary commands inside the agent worker during deserialization (CWE-502).
