"""Grounded question answering over the user's saved library with citations."""

import logging
import re
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import Item, ItemConcept, ItemStatus
from app.schemas import AskResponse, Citation
from app.services.llm import LLMError
from app.services.llm.groq import GroqProvider

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
    "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "he", "her", "here", "hers", "herself",
    "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn't", "it",
    "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
    "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
    "she", "should", "shouldn't", "so", "some", "such", "than", "that", "the",
    "their", "theirs", "them", "themselves", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "wasn't", "we", "were", "weren't", "what", "when", "where", "which", "while",
    "who", "whom", "why", "with", "won't", "would", "wouldn't", "you", "your",
    "yours", "yourself", "yourselves",
}


def _extract_query_terms(query: str) -> list[str]:
    raw_words = re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", query.lower())
    terms = [w for w in raw_words if w not in STOPWORDS]
    return terms if terms else raw_words


def _find_best_excerpt(text: str, terms: list[str], max_len: int = 280) -> str:
    """Find a window in text that contains as many search terms as possible."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text

    lower = text.lower()
    best_pos = 0
    max_matches = 0

    for term in terms:
        pos = lower.find(term)
        if pos != -1:
            matches = sum(1 for t in terms if t in lower[max(0, pos - 100):pos + 200])
            if matches > max_matches:
                max_matches = matches
                best_pos = pos

    start = max(0, best_pos - 60)
    # Align to word boundary
    if start > 0:
        space = text.find(" ", start)
        if space != -1 and space < start + 30:
            start = space + 1

    excerpt = text[start:start + max_len].strip()
    if start > 0:
        excerpt = "…" + excerpt
    if start + max_len < len(text):
        excerpt = excerpt + "…"
    return excerpt


def answer_question(
    db: Session,
    owner_id: uuid.UUID,
    question: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> AskResponse:
    """Retrieve relevant resources for owner_id and generate a grounded answer."""
    terms = _extract_query_terms(question)
    if not terms:
        return AskResponse(
            answer="Please ask a more specific question about the resources in your library.",
            citations=[],
        )

    # Fetch all ready items for this owner
    stmt = (
        select(Item)
        .where(Item.owner_id == owner_id, Item.status == ItemStatus.READY.value)
        .options(selectinload(Item.concept_links).selectinload(ItemConcept.concept))
    )
    items = list(db.scalars(stmt))
    if not items:
        return AskResponse(
            answer="Your library does not contain any saved resources yet. Save some articles or notes first to ask questions about them.",
            citations=[],
        )

    scored_items: list[tuple[float, Item, str]] = []
    for item in items:
        title_lower = (item.title or "").lower()
        summary_lower = (item.summary or "").lower()
        raw_lower = (item.raw_text or "").lower()
        concept_names = " ".join(link.concept.name.lower() for link in item.concept_links)

        score = 0.0
        for term in terms:
            if term in title_lower:
                score += 3.0
            if term in concept_names:
                score += 2.5
            if term in summary_lower:
                score += 2.0
            if term in raw_lower:
                score += 1.0

        if score > 0:
            # Pick excerpt
            body = item.summary or item.raw_text or ""
            excerpt = _find_best_excerpt(body, terms)
            scored_items.append((score, item, excerpt))

    scored_items.sort(key=lambda x: x[0], reverse=True)
    top_matches = scored_items[:5]

    if not top_matches:
        return AskResponse(
            answer="I couldn't find any information in your saved resources that relates to your question.",
            citations=[],
        )

    citations: list[Citation] = []
    sources_context_lines = []

    for i, (_, item, excerpt) in enumerate(top_matches, start=1):
        citations.append(
            Citation(
                citation_number=i,
                item_id=item.id,
                title=item.title or "Untitled",
                url=item.url,
                source_type=item.source_type,
                excerpt=excerpt,
            )
        )
        sources_context_lines.append(
            f"[{i}] Title: {item.title or 'Untitled'}\n"
            f"Summary: {item.summary or 'None'}\n"
            f"Content: {excerpt}\n"
        )

    sources_context = "\n".join(sources_context_lines)

    system_instruction = (
        "You are RabbitHole's research assistant. Answer the user's question directly and concisely, "
        "grounded strictly in the provided sources from their saved library. Do not make up facts or "
        "assume information not present in the sources. Whenever you state a fact or summarize an idea "
        "from a source, cite it with its bracket number like [1] or [2]. If the sources do not provide "
        "enough detail to completely answer, state what is known and clarify what is missing."
    )
    user_prompt = (
        f"Sources from user's library:\n{sources_context}\n\n"
        f"Question: {question}\n\n"
        "Grounded Answer (including citations [1], [2]):"
    )

    settings = get_settings()
    if settings.llm_provider == "groq" and settings.groq_api_key:
        try:
            # Call Groq directly using text completion
            payload = {
                "model": settings.groq_model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
            }
            with httpx.Client(transport=transport, timeout=httpx.Timeout(45.0, connect=10.0)) as client:
                res = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                )
                if res.status_code == 200:
                    answer_text = res.json()["choices"][0]["message"]["content"].strip()
                    return AskResponse(answer=answer_text, citations=citations)
        except Exception:
            logger.exception("Failed to get Groq answer for question")

    # Fallback when AI service is unavailable: generate a clear, structured summary with citations
    fallback_lines = [
        f"Here is what your saved library contains regarding **{question}**:\n"
    ]
    for cit in citations:
        fallback_lines.append(f"- **[{cit.citation_number}] {cit.title}**: {cit.excerpt}")
    fallback_lines.append("\n*(Note: Synthesized directly from your library sources)*")

    return AskResponse(answer="\n".join(fallback_lines), citations=citations)
