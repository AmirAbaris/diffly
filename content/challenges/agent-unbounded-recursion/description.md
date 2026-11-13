# Unbounded Agent Tool Recursion & Cost Exhaustion

## Description
An autonomous research agent runs a ReAct reasoning loop to solve complex tasks. The agent plans steps, invokes tools (e.g. search, calculation), appends execution results to its conversation history, and invokes the LLM again until the LLM decides to terminate without tool calls.

## Threat Model
LLMs are prone to reasoning loops, hallucinated tool outputs, and repetitive retry behavior when encountering unresolvable tool errors or circular task goals. Without a hard iteration limit (`max_steps`), token ceiling, or runtime circuit breaker, the agent can enter an infinite invocation loop. This exhausts API token quotas, incurs thousands of dollars in LLM API billing within minutes, and exhausts backend worker thread pools.
