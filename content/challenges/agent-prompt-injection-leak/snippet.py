from typing import Any
import openai


class DocumentAuditAgent:
    """Agent that audits developer PRs and external docs."""

    def __init__(self, key: str, tools: list[str]) -> None:
        self.client = openai.OpenAI(api_key=key)
        self.tools = tools

    def audit_doc(self, title: str, content: str) -> str:
        """Analyze untrusted document and return review."""
        # Defect: Untrusted input concatenated into prompt
        prompt = f"Tools: {self.tools}\nDoc: {title}\n{content}"
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": "Audit now."},
            ],
            temperature=0.0,
        )
        return response.choices[0].message.content or ""
