package com.acme.agent.checkpoint;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.Serializable;
import java.util.Base64;
import java.util.List;
import java.util.Map;

public class AgentCheckpointStore {
    public record AgentSessionState(
            String sessionId,
            String activeGoal,
            List<String> toolHistory,
            Map<String, String> scratchpad) implements Serializable {
        private static final long serialVersionUID = 1L;
    }

    public interface CheckpointBackend {
        String fetchEncodedCheckpoint(String sessionId);
    }

    private final CheckpointBackend backend;

    public AgentCheckpointStore(CheckpointBackend backend) {
        this.backend = backend;
    }

    public AgentSessionState restoreSession(String sessionId)
            throws IOException, ClassNotFoundException {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId must not be blank");
        }

        String encoded = backend.fetchEncodedCheckpoint(sessionId);
        if (encoded == null || encoded.isBlank()) {
            throw new IllegalStateException("No checkpoint found for session: " + sessionId);
        }

        byte[] payload = Base64.getDecoder().decode(encoded);
        try (ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(payload))) {
            Object restored = ois.readObject();
            if (!(restored instanceof AgentSessionState state)) {
                throw new ClassCastException("Unexpected checkpoint payload type");
            }
            return state;
        }
    }
}
