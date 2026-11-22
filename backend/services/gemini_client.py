"""Shared HTTPX transport and protocol for Gemini structured JSON generation."""

import json
import re
from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable

import httpx


DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
FALLBACK_GEMINI_MODELS = (
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest",
)
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiError(Exception):
    """Base exception for Gemini generation service."""


class GeminiAuthError(GeminiError):
    """Raised when Gemini API key is missing or invalid (HTTP 401)."""


class GeminiRateLimitError(GeminiError):
    """Raised when Gemini API rate limit is exceeded (HTTP 429)."""


class GeminiAPIError(GeminiError):
    """Raised when Gemini API encounters server or network errors (HTTP 502)."""


class GeminiSchemaError(GeminiError):
    """Raised when Gemini output fails schema validation (HTTP 502)."""


def clean_markdown_json(raw_text: str) -> str:
    """Strip markdown code fence blocks if returned by the LLM."""
    trimmed = raw_text.strip()
    if trimmed.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", trimmed)
        if match:
            return match.group(1).strip()
    return trimmed


@runtime_checkable
class GeminiJsonClient(Protocol):
    """Protocol for structured JSON generation against a Gemini backend."""

    async def generate_json(
        self,
        *,
        prompt: str,
        response_schema: dict[str, Any],
        api_key: str,
        model: str = DEFAULT_GEMINI_MODEL,
        temperature: float = 0.2,
        fallback_models: Sequence[str] = FALLBACK_GEMINI_MODELS,
    ) -> dict[str, Any]: ...


class HttpxGeminiClient:
    """HTTPX-backed Gemini structured JSON client with model fallback."""

    def __init__(
        self,
        http_client: httpx.AsyncClient | None = None,
        *,
        base_url: str = GEMINI_API_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self._http_client = http_client
        self._base_url = base_url
        self._timeout = timeout

    async def generate_json(
        self,
        *,
        prompt: str,
        response_schema: dict[str, Any],
        api_key: str,
        model: str = DEFAULT_GEMINI_MODEL,
        temperature: float = 0.2,
        fallback_models: Sequence[str] = FALLBACK_GEMINI_MODELS,
    ) -> dict[str, Any]:
        if not isinstance(api_key, str) or any(
            ch in api_key for ch in ("\r", "\n", "\x00")
        ):
            raise GeminiAuthError(
                "Missing or invalid Gemini API key. "
                "Provide a valid key in the X-Gemini-Key header."
            )
        cleaned_key = api_key.strip()
        if not cleaned_key or not cleaned_key.isascii():
            raise GeminiAuthError(
                "Missing or invalid Gemini API key. "
                "Provide a valid key in the X-Gemini-Key header."
            )

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": cleaned_key,
        }
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "response_schema": response_schema,
                "temperature": temperature,
            },
        }
        models_to_try = [model]
        for fallback in fallback_models:
            if fallback not in models_to_try:
                models_to_try.append(fallback)

        owns_client = self._http_client is None
        http_client = self._http_client or httpx.AsyncClient(timeout=self._timeout)

        try:
            last_response: httpx.Response | None = None
            for current_model in models_to_try:
                url = f"{self._base_url}/{current_model}:generateContent"
                try:
                    response = await http_client.post(
                        url, json=payload, headers=headers
                    )
                    last_response = response
                except httpx.RequestError as exc:
                    if current_model == models_to_try[-1]:
                        raise GeminiAPIError(
                            "Failed to communicate with Gemini API: "
                            f"{exc.__class__.__name__}"
                        ) from exc
                    continue

                if (
                    response.status_code in {404, 503}
                    and current_model != models_to_try[-1]
                ):
                    continue
                break
        finally:
            if owns_client:
                await http_client.aclose()

        if last_response is None:
            raise GeminiAPIError("No response received from Gemini API")

        response = last_response

        if response.status_code == 400:
            err_body = response.text
            if "API_KEY_INVALID" in err_body or "API key not valid" in err_body:
                raise GeminiAuthError("Invalid Gemini API key or unauthorized request.")
            raise GeminiAPIError(f"Gemini API bad request: {err_body}")

        if response.status_code in {401, 403}:
            raise GeminiAuthError("Invalid Gemini API key or unauthorized request.")

        if response.status_code == 429:
            raise GeminiRateLimitError(
                "Gemini API rate limit exceeded. Please try again later."
            )

        if response.status_code != 200:
            raise GeminiAPIError(
                f"Gemini API request failed with status code {response.status_code}"
            )

        try:
            res_json = response.json()
            candidates = res_json.get("candidates") or []
            if not candidates or not isinstance(candidates, list):
                raise GeminiSchemaError("Gemini returned empty candidate response")

            content = candidates[0].get("content") or {}
            parts = content.get("parts") or [{}]
            first_part = parts[0] if isinstance(parts, list) and parts else {}
            raw_text = first_part.get("text") or ""
            clean_text = clean_markdown_json(raw_text)
            parsed_data = json.loads(clean_text)
        except (
            json.JSONDecodeError,
            KeyError,
            IndexError,
            AttributeError,
            TypeError,
        ) as exc:
            raise GeminiSchemaError(f"Failed to parse Gemini output: {exc}") from exc

        if not isinstance(parsed_data, dict):
            raise GeminiSchemaError("Generated payload must be a JSON object")

        return parsed_data


__all__ = [
    "DEFAULT_GEMINI_MODEL",
    "FALLBACK_GEMINI_MODELS",
    "GEMINI_API_BASE_URL",
    "GeminiAPIError",
    "GeminiAuthError",
    "GeminiError",
    "GeminiJsonClient",
    "GeminiRateLimitError",
    "GeminiSchemaError",
    "HttpxGeminiClient",
    "clean_markdown_json",
]
