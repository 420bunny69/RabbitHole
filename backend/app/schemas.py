import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import Item
from app.services.extractors.base import MAX_TEXT_CHARS

MIN_PASTED_CHARS = 20


class ItemCreate(BaseModel):
    """What the frontend sends to save something: a URL or pasted text, never both."""

    url: str | None = Field(default=None, max_length=2048)
    text: str | None = Field(default=None, max_length=MAX_TEXT_CHARS)
    title: str | None = Field(default=None, max_length=500)

    @field_validator("url", "text", "title", mode="after")
    @classmethod
    def blank_becomes_none(cls, value: str | None) -> str | None:
        value = value.strip() if value else value
        return value or None

    @model_validator(mode="after")
    def exactly_one_source(self) -> "ItemCreate":
        if bool(self.url) == bool(self.text):
            raise ValueError("Provide either a url or text, but not both")
        if self.text and len(self.text) < MIN_PASTED_CHARS:
            raise ValueError(f"Pasted text must be at least {MIN_PASTED_CHARS} characters")
        return self


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_type: str
    url: str | None
    title: str | None
    summary: str | None
    status: str
    error_message: str | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def assume_utc(cls, value: datetime) -> datetime:
        """SQLite returns times without a timezone, Postgres with one. Always send UTC with a "Z",
        otherwise browsers would read the SQLite version as local time."""
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class ConceptRef(BaseModel):
    name: str
    relevance: float


class ItemDetail(ItemOut):
    raw_text: str | None
    concepts: list[ConceptRef] = []

    @classmethod
    def from_item(cls, item: Item) -> "ItemDetail":
        """Build the detail view, listing concepts from most to least relevant."""
        links = sorted(item.concept_links, key=lambda link: -link.relevance)
        return cls(
            **ItemOut.model_validate(item).model_dump(),
            raw_text=item.raw_text,
            concepts=[ConceptRef(name=link.concept.name, relevance=link.relevance) for link in links],
        )
