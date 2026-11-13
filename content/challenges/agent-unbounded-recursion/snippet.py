from typing import Any


class AutonomousResearchAgent:
    def __init__(self, llm_client: Any, tools: dict[str, Any]) -> None:
        self.llm = llm_client
        self.tools = tools
        self.conversation_history: list[dict[str, str]] = []

    async def execute_task(self, user_objective: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_objective})

        # Run autonomous reasoning loop until LLM issues final response
        while True:
            response = await self.llm.generate_plan_step(
                messages=self.conversation_history
            )

            # Check if LLM requested a tool execution
            if response.tool_calls:
                for call in response.tool_calls:
                    tool_name = call["name"]
                    arguments = call["arguments"]
                    tool_fn = self.tools.get(tool_name)

                    if not tool_fn:
                        self.conversation_history.append({
                            "role": "system",
                            "content": f"Error: Tool {tool_name} not found.",
                        })
                        continue

                    # Invoke tool and feed observation back to agent memory
                    result = await tool_fn(**arguments)
                    self.conversation_history.append({
                        "role": "tool",
                        "name": tool_name,
                        "content": str(result),
                    })
            else:
                # LLM finished reasoning and produced final answer
                return response.content
