# Per-Request HttpClient Instantiation Causing Socket Exhaustion

## Description

An FX pricing service queries an upstream market-data API for spot currency rates on each checkout request. Inside `FetchSpotRateAsync`, it validates currency codes, constructs the provider URI, instantiates a new `HttpClient` wrapped in a `using` declaration, and deserializes the JSON quote response.

## Threat Model

Under moderate to high traffic (or traffic bursts), creating and disposing a fresh `HttpClient` on every request tears down its underlying `SocketsHttpHandler` pool while leaving OS TCP sockets lingering in `TIME_WAIT` for minutes. Rapid port turnover exhausts ephemeral sockets, triggers `SocketException` failures across unrelated outbound dependencies, and degrades service availability (CWE-400).
