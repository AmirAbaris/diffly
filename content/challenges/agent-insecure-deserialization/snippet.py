import base64
import pickle
from typing import Any
import redis


class AgentMemoryCheckpointManager:
    def __init__(self, redis_client: redis.Redis) -> None:
        self.redis = redis_client

    def save_checkpoint(self, session_id: str, state_data: dict[str, Any]) -> None:
        """Serialize and persist agent memory state to Redis cache."""
        serialized = pickle.dumps(state_data, protocol=pickle.HIGHEST_PROTOCOL)
        b64_payload = base64.b64encode(serialized).decode("utf-8")
        self.redis.set(f"agent:checkpoint:{session_id}", b64_payload, ex=86400)

    def restore_checkpoint(self, session_id: str) -> dict[str, Any]:
        """Retrieve and deserialize agent state checkpoint for session resuming."""
        cached = self.redis.get(f"agent:checkpoint:{session_id}")
        if not cached:
            return {"history": [], "context": {}, "step_count": 0}

        raw_bytes = base64.b64decode(cached)
        # Rehydrate agent execution graph and conversation context
        restored_state: dict[str, Any] = pickle.loads(raw_bytes)
        return restored_state
