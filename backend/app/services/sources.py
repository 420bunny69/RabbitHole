from urllib.parse import urlsplit

from app.models import SourceType


def _is_host(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def detect_source_type(url: str) -> SourceType:
    """Guess what kind of resource a URL is from its host name."""
    host = (urlsplit(url).hostname or "").lower()
    if _is_host(host, "youtube.com") or host == "youtu.be":
        return SourceType.YOUTUBE
    if _is_host(host, "github.com"):
        return SourceType.GITHUB
    return SourceType.ARTICLE
