"""Hosted AI through Groq's OpenAI-compatible API (free tier available)."""

import logging

import httpx

from app.services.llm.base import LLMError, LLMOutputError

logger = logging.getLogger(__name__)

URL = "https://api.groq.com/openai/v1/chat/completions"
TIMEOUT = httpx.Timeout(60.0, connect=10.0)


class GroqProvider:
    def __init__(self, api_key: str, model: str, transport: httpx.BaseTransport | None = None):
        self.api_key = api_key
        self.model = model
        self.transport = transport  # only tests pass this, to fake the network

    def complete_json(self, system: str, user: str) -> str:
        if not self.api_key:
            raise LLMError("The AI service is not configured (missing GROQ_API_KEY)")

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(transport=self.transport, timeout=TIMEOUT) as client:
                response = client.post(
                    URL, json=payload, headers={"Authorization": f"Bearer {self.api_key}"}
                )
        except httpx.TimeoutException:
            raise LLMError("The AI service took too long to respond") from None
        except httpx.HTTPError:
            raise LLMError("Could not reach the AI service") from None

        if response.status_code >= 400:
            self._raise_for_error(response)

        try:
            return response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise LLMError("The AI service returned an unexpected response") from None

    @staticmethod
    def _raise_for_error(response: httpx.Response) -> None:
        logger.warning("Groq error %s: %s", response.status_code, response.text[:500])
        if response.status_code == 429:
            raise LLMError("The AI service is busy right now (rate limit). Please retry in a minute")
        if response.status_code in (401, 403):
            raise LLMError("The AI service rejected our API key")
        if response.status_code == 400 and "json_validate_failed" in response.text:
            # The model produced broken JSON; the analyzer will ask again.
            raise LLMOutputError("The AI returned broken JSON")
        raise LLMError("The AI service returned an error")
