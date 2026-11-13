import asyncio
from typing import Any


class ReviewOrchestrator:
    """Orchestrates parallel tasks across specialized agents."""

    async def run_linter(self, repo_path: str) -> dict[str, Any]:
        await asyncio.sleep(0.5)
        return {"tool": "linter", "status": "clean"}

    async def run_security_scan(self, repo_path: str) -> dict[str, Any]:
        await asyncio.sleep(0.8)
        # Transient failure simulation
        raise ConnectionError("Security scanner endpoint unreachable.")

    async def run_type_checker(self, repo_path: str) -> dict[str, Any]:
        # Expensive background operation
        await asyncio.sleep(5.0)
        return {"tool": "type_checker", "status": "valid"}

    async def analyze_repo(
        self, path: str
    ) -> list[dict[str, Any]]:
        """Run all review checks in parallel and return findings."""
        tasks = [
            asyncio.create_task(self.run_linter(path)),
            asyncio.create_task(self.run_security_scan(path)),
            asyncio.create_task(self.run_type_checker(path)),
        ]

        # Defect: gather without return_exceptions=True or cleanup
        results = await asyncio.gather(*tasks)
        return results
