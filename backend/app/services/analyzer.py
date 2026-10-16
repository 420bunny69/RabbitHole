"""Turns text into a summary and key concepts using the AI, and VALIDATES what comes back.

AI output is untrusted: it can be broken JSON, wrapped in code fences, use the wrong field names or
return nonsense. Nothing from the AI reaches the database without passing through `Analysis`.
"""

import json
import logging
import re

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.services.llm import LLMError, LLMOutputError, LLMProvider, get_llm_provider
from app.services.llm.prompts import RETRY_NOTE, SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

MIN_SUMMARY_CHARS = 20
MAX_SUMMARY_CHARS = 1500
MAX_CONCEPTS = 8
MAX_CONCEPT_WORDS = 5
MAX_CONCEPT_CHARS = 60
DEFAULT_RELEVANCE = 0.5
ATTEMPTS = 2  # one try plus one retry when the answer is unusable


def normalize_concept_name(raw: str) -> str:
    """Lowercase, trim and tidy a concept so "Gradient  Descent." and "gradient descent" match."""
    name = re.sub(r"\s+", " ", raw).strip().lower()
    return name.strip(" .,:;!?\"'()[]{}-–—")[:MAX_CONCEPT_CHARS].strip()


def _coerce_relevance(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DEFAULT_RELEVANCE
    if 1 < number <= 100:  # the model answered on a 0-100 scale
        number /= 100
    return min(max(number, 0.0), 1.0)


class AnalyzedConcept(BaseModel):
    name: str
    relevance: float


class Analysis(BaseModel):
    summary: str
    concepts: list[AnalyzedConcept] = Field(min_length=1)

    @field_validator("summary")
    @classmethod
    def _check_summary(cls, value: str) -> str:
        value = value.strip()
        if len(value) < MIN_SUMMARY_CHARS:
            raise ValueError("summary is too short")
        return value[:MAX_SUMMARY_CHARS]

    @field_validator("concepts", mode="before")
    @classmethod
    def _clean_concepts(cls, raw: object) -> list[dict]:
        """Accept slightly messy lists, drop junk entries, merge duplicates, keep the best few."""
        if not isinstance(raw, list):
            raise ValueError("concepts must be a list")

        best: dict[str, float] = {}
        for entry in raw:
            if isinstance(entry, str):  # some models answer ["a", "b"] instead of objects
                name, relevance = entry, DEFAULT_RELEVANCE
            elif isinstance(entry, dict):
                name, relevance = entry.get("name"), entry.get("relevance", DEFAULT_RELEVANCE)
            else:
                continue
            if not isinstance(name, str):
                continue
            name = normalize_concept_name(name)
            if not name or len(name.split()) > MAX_CONCEPT_WORDS:
                continue
            best[name] = max(best.get(name, 0.0), _coerce_relevance(relevance))

        ranked = sorted(best.items(), key=lambda pair: -pair[1])[:MAX_CONCEPTS]
        return [{"name": name, "relevance": relevance} for name, relevance in ranked]


def parse_analysis(raw: str) -> Analysis:
    """Parse the AI's raw text into an Analysis, or raise LLMOutputError."""
    text = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)  # ```json ... ```
    if fenced:
        text = fenced.group(1)
    try:
        return Analysis.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as error:
        logger.warning("Unusable AI output (%s): %.300r", type(error).__name__, raw)
        raise LLMOutputError("The AI returned an answer we could not use") from None


def analyze_text(
    title: str | None, text: str, provider: LLMProvider | None = None
) -> Analysis:
    """Ask the AI for a summary and concepts. Retries once if the answer is unusable.

    Problems with the AI service itself (rate limit, bad key, network) are NOT retried:
    asking again right away would not help and would burn free-tier quota.
    """
    provider = provider or get_llm_provider()
    user_prompt = build_user_prompt(title, text)

    for attempt in range(ATTEMPTS):
        prompt = user_prompt if attempt == 0 else user_prompt + RETRY_NOTE
        try:
            return parse_analysis(provider.complete_json(SYSTEM_PROMPT, prompt))
        except LLMOutputError:
            continue
    raise LLMError("The AI gave an answer we could not understand. Please try again")
