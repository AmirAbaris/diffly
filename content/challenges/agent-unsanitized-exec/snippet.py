import math
from typing import Any


class CalculatorTool:
    """Tool used by autonomous agents to evaluate math expressions."""

    name: str = "calculator"
    description: str = "Evaluates math expressions from reasoning."

    def __init__(self) -> None:
        self.allowed_names = {
            "sin": math.sin,
            "cos": math.cos,
            "sqrt": math.sqrt,
            "pi": math.pi,
        }

    def execute(self, expression: str) -> dict[str, Any]:
        """Execute mathematical calculation requested by the agent."""
        if not expression or not isinstance(expression, str):
            raise ValueError("Expression must be a non-empty string.")

        # Strip surrounding whitespace and backticks
        clean_expr = expression.strip().strip("`")

        try:
            # Danger: eval executes arbitrary code
            result = eval(
                clean_expr,
                {"__builtins__": __builtins__},
                self.allowed_names,
            )
            return {"status": "success", "result": result}
        except Exception as exc:
            return {"status": "error", "message": f"Failed: {exc}"}
