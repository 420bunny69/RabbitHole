import json
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


MAX_LIST_CONCEPTS = 5


class ItemSummary(ItemOut):
    """An item as shown in the library list: includes its most relevant concept names."""

    concepts: list[str] = []

    @classmethod
    def from_item(cls, item: Item) -> "ItemSummary":
        links = sorted(item.concept_links, key=lambda link: -link.relevance)[:MAX_LIST_CONCEPTS]
        return cls(
            **ItemOut.model_validate(item).model_dump(),
            concepts=[link.concept.name for link in links],
        )


class ConceptRef(BaseModel):
    name: str
    relevance: float


class ItemDetail(ItemOut):
    raw_text: str | None
    notes: str | None = None
    takeaways: list[str] = []
    concepts: list[ConceptRef] = []

    @classmethod
    def from_item(cls, item: Item) -> "ItemDetail":
        """Build the detail view, listing concepts from most to least relevant."""
        links = sorted(item.concept_links, key=lambda link: -link.relevance)
        takeaways_list: list[str] = []
        if item.takeaways:
            try:
                parsed = json.loads(item.takeaways)
                if isinstance(parsed, list):
                    takeaways_list = [str(t) for t in parsed if t]
                elif isinstance(parsed, str):
                    takeaways_list = [parsed]
            except Exception:
                takeaways_list = [t.strip("-* ").strip() for t in item.takeaways.splitlines() if t.strip()]

        return cls(
            **ItemOut.model_validate(item).model_dump(),
            raw_text=item.raw_text,
            notes=item.notes,
            takeaways=takeaways_list,
            concepts=[ConceptRef(name=link.concept.name, relevance=link.relevance) for link in links],
        )


class ItemNotesUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=50_000)


class RelatedItem(BaseModel):
    id: uuid.UUID
    title: str | None
    url: str | None
    source_type: str
    summary: str | None
    relationship_reason: str
    shared_concepts: list[str] = []


class TopicItem(BaseModel):
    id: uuid.UUID
    title: str | None
    url: str | None
    source_type: str
    summary: str | None
    status: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def assume_utc(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class TopicDetail(BaseModel):
    id: int
    name: str
    count: int
    items: list[TopicItem] = []


class Citation(BaseModel):
    citation_number: int
    item_id: uuid.UUID
    title: str | None
    url: str | None
    source_type: str
    excerpt: str


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation] = []


class TrailStep(BaseModel):
    id: str
    step_type: str  # "item", "concept", "external"
    title: str
    item_id: uuid.UUID | None = None
    url: str | None = None
    source_type: str | None = None
    connection_reason: str
    is_external: bool = False


class Trail(BaseModel):
    id: str
    title: str
    steps: list[TrailStep] = []


class GraphNode(BaseModel):
    """A dot in the knowledge graph: either a saved item or a concept that items share."""

    id: str  # "item:<uuid>" or "concept:<number>", unique across both kinds
    type: str  # "item" or "concept"
    label: str
    item_id: uuid.UUID | None = None  # items only: open it at /items/{item_id}
    source_type: str | None = None  # items only
    url: str | None = None  # items only
    count: int | None = None  # concepts only: how many items use it


class GraphEdge(BaseModel):
    id: str
    source: str  # an item node id
    target: str  # a concept node id
    weight: float  # how relevant the concept is to the item, 0 to 1


class Graph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    truncated: bool  # true when older items were left out because of the limit