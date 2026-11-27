using Newtonsoft.Json;

namespace Acme.Agents.Memory;

public sealed record ToolOutputEntry(string ToolName, object? Payload, DateTimeOffset RecordedAt);

public sealed record AgentCheckpoint(
    string SessionId,
    int StepIndex,
    IReadOnlyList<ToolOutputEntry> ToolOutputs);

public sealed class AgentCheckpointSerializer
{
    private const int MaxPayloadBytes = 512_000;

    private static readonly JsonSerializerSettings SerializerSettings = new()
    {
        TypeNameHandling = TypeNameHandling.Auto,
        MetadataPropertyHandling = MetadataPropertyHandling.ReadAhead,
        MaxDepth = 32,
    };

    public string Serialize(AgentCheckpoint checkpoint)
    {
        ArgumentNullException.ThrowIfNull(checkpoint);
        return JsonConvert.SerializeObject(checkpoint, SerializerSettings);
    }

    public AgentCheckpoint Deserialize(string rawCheckpointJson)
    {
        if (string.IsNullOrWhiteSpace(rawCheckpointJson))
        {
            throw new ArgumentException("Checkpoint JSON must not be empty.", nameof(rawCheckpointJson));
        }

        if (rawCheckpointJson.Length > MaxPayloadBytes)
        {
            throw new InvalidOperationException("Checkpoint payload exceeds maximum allowed size.");
        }

        AgentCheckpoint? checkpoint = JsonConvert.DeserializeObject<AgentCheckpoint>(
            rawCheckpointJson,
            SerializerSettings);

        return checkpoint ?? throw new JsonSerializationException("Checkpoint deserialized to null.");
    }
}
