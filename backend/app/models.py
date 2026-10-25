import uuid
from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SourceType(StrEnum):
    ARTICLE = "article"
    YOUTUBE = "youtube"
    GITHUB = "github"
    TEXT = "text"


class ItemStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class SuggestionSource(StrEnum):
    WIKIPEDIA = "wikipedia"
    HN = "hn"
    GITHUB = "github"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Item(Base):
    """One saved resource (an article, video, repo or pasted text)."""

    __tablename__ = "items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(index=True)  # anonymous visitor ID
    source_type: Mapped[str] = mapped_column(String(20), default=SourceType.ARTICLE.value)
    url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(500))
    raw_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    takeaways: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=ItemStatus.PENDING.value)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    concept_links: Mapped[list["ItemConcept"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    suggestions: Mapped[list["Suggestion"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )


class Concept(Base):
    """A key idea, such as "gradient descent". Shared by every item of the same owner that mentions it."""

    __tablename__ = "concepts"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_concepts_owner_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(200))  # stored normalized (lowercase, trimmed)

    item_links: Mapped[list["ItemConcept"]] = relationship(
        back_populates="concept", cascade="all, delete-orphan"
    )


class ItemConcept(Base):
    """Links an item to a concept. Graph edges are computed from these rows."""

    __tablename__ = "item_concepts"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    concept_id: Mapped[int] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    relevance: Mapped[float] = mapped_column(Float, default=1.0)  # 0 to 1

    item: Mapped[Item] = relationship(back_populates="concept_links")
    concept: Mapped[Concept] = relationship(back_populates="item_links")


class Suggestion(Base):
    """An external resource (Wikipedia, Hacker News, GitHub) suggested for an item."""

    __tablename__ = "suggestions"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20))
    snippet: Mapped[str | None] = mapped_column(Text)

    item: Mapped[Item] = relationship(back_populates="suggestions")
