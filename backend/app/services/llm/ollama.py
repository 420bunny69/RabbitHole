"""Local AI through Ollama (https://ollama.com). Free, private, needs no API key."""

import logging

import httpx

from app.services.llm.base import LLMError

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(180.0, connect=5.0)  # local models can be slow, especially on first load


class OllamaProvider:
    def __init__(self, base_url: str, model: str, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.transport = transport  # only tests pass this, to fake the network

    def complete_json(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2},
        }
        try:
            with httpx.Client(transport=self.transport, timeout=TIMEOUT) as client:
                response = client.post(f"{self.base_url}/api/chat", json=payload)
        except httpx.TimeoutException:
            raise LLMError("The local AI model took too long to respond") from None
        except httpx.HTTPError:
            raise LLMError(
                "Could not reach the local Ollama server. Is Ollama running?"
            ) from None

        if response.status_code == 404:
            raise LLMError(f"Ollama does not have the model '{self.model}'. Run: ollama pull {self.model}")
        if response.status_code >= 400:
            logger.warning("Ollama error %s: %s", response.status_code, response.text[:500])
            raise LLMError("The local AI service returned an error")

        try:
            return response.json()["message"]["content"]
        except (ValueError, KeyError, TypeError):
            raise LLMError("The local AI service returned an unexpected response") from None
