# Insecure Deserialization in Agent State Checkpoint

## Description
A distributed autonomous agent framework maintains session checkpoints across multiple reasoning turns. To enable state resumption after worker restarts, the `AgentMemoryCheckpointManager` serializes intermediate graph state into Redis and later restores it using Python's native `pickle` module.

## Threat Model
If an attacker can manipulate or inject data into the Redis checkpoint key (via SSRF, Redis cache poisoning, compromised session IDs, or multi-tenant database access), `pickle.loads` will deserialize arbitrary serialized Python bytecode. By crafting a payload leveraging Python's `__reduce__` method, an attacker achieves Remote Code Execution (RCE) on the agent host machine with process privileges.
