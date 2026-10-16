from typing import Protocol


class LLMError(Exception):
    """The AI step failed. The message is safe to show to the visitor."""


class LLMOutputError(LLMError):
    """The AI answered, but not with usable JSON. The analyzer retries these once."""


class LLMProvider(Protocol):
    """Anything that can answer a prompt with a JSON object, returned as raw text.

    The analyzer parses and validates that text itself, so providers stay small and
    swapping Groq for Ollama never changes the rest of the app.
    """

    def complete_json(self, system: str, user: str) -> str: ...
