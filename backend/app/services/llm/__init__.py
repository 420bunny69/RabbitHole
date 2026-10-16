import logging

import httpx

from app.config import Settings, get_settings
from app.services.llm.base import LLMError, LLMOutputError, LLMProvider
from app.services.llm.groq import GroqProvider
from app.services.llm.ollama import OllamaProvider

logger = logging.getLogger(__name__)


def get_llm_provider(
    settings: Settings | None = None, transport: httpx.BaseTransport | None = None
) -> LLMProvider:
    """Build the AI provider chosen by LLM_PROVIDER ("groq" or "ollama")."""
    settings = settings or get_settings()
    name = settings.llm_provider.strip().lower()
    if name == "groq":
        return GroqProvider(settings.groq_api_key, settings.groq_model, transport)
    if name == "ollama":
        return OllamaProvider(settings.ollama_base_url, settings.ollama_model, transport)
    logger.error("Unknown LLM_PROVIDER %r (expected 'groq' or 'ollama')", settings.llm_provider)
    raise LLMError("The AI service is not configured correctly")


__all__ = ["LLMError", "LLMOutputError", "LLMProvider", "get_llm_provider"]
