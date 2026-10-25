"""Extracts transcripts and metadata from YouTube videos."""

import html
import json
import logging
import re
from urllib.parse import parse_qs, urlsplit
import xml.etree.ElementTree as ET

import httpx

from app.services.extractors.base import MAX_TEXT_CHARS, ExtractedContent, ExtractionError
from app.services.fetcher import FetchError, fetch_page
from app.utils.url_safety import UnsafeURLError, validate_public_url

logger = logging.getLogger(__name__)

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


def extract_video_id(url: str) -> str | None:
    """Extract 11-character video ID from various YouTube URL formats."""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if host not in YOUTUBE_HOSTS and not any(host.endswith("." + h) for h in ("youtube.com", "youtu.be")):
        return None

    if host == "youtu.be":
        path = parsed.path.strip("/")
        return path[:11] if len(path) >= 11 else None

    # youtube.com/watch?v=...
    if parsed.path == "/watch":
        qs = parse_qs(parsed.query)
        v = qs.get("v")
        if v and len(v[0]) == 11:
            return v[0]

    # youtube.com/shorts/... or youtube.com/embed/...
    match = re.search(r"/(?:shorts|embed)/([a-zA-Z0-9_-]{11})", parsed.path)
    if match:
        return match.group(1)

    return None


def _extract_title(html_content: str) -> str | None:
    # Try og:title
    og_match = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\'](.*?)["\']', html_content, re.IGNORECASE)
    if og_match:
        return html.unescape(og_match.group(1)).replace(" - YouTube", "").strip()

    title_match = re.search(r"<title>(.*?)</title>", html_content, re.IGNORECASE)
    if title_match:
        return html.unescape(title_match.group(1)).replace(" - YouTube", "").strip()

    return None


def _extract_captions_url(html_content: str) -> str | None:
    """Find the timedtext captions URL from ytInitialPlayerResponse in the page HTML."""
    match = re.search(r"ytInitialPlayerResponse\s*=\s*({.+?});(?:var|<\/script>)", html_content)
    if not match:
        # Fallback to json search inside the page
        match = re.search(r'"captionTracks":\s*(\[\{.+?\}\])', html_content)
        if match:
            try:
                tracks = json.loads(match.group(1))
                if tracks and isinstance(tracks, list) and "baseUrl" in tracks[0]:
                    return tracks[0]["baseUrl"]
            except Exception:
                pass
        return None

    try:
        data = json.loads(match.group(1))
        captions = data.get("captions", {})
        tracklist = captions.get("playerCaptionsTracklistRenderer", {})
        tracks = tracklist.get("captionTracks", [])
        if not tracks:
            return None

        # Prefer English if available
        for track in tracks:
            lang = track.get("languageCode", "").lower()
            if lang.startswith("en"):
                return track.get("baseUrl")
        return tracks[0].get("baseUrl")
    except Exception:
        logger.debug("Failed to parse ytInitialPlayerResponse JSON")
        return None


def parse_timedtext_xml(xml_content: str) -> str:
    """Parse YouTube timedtext XML and extract spoken text."""
    try:
        root = ET.fromstring(xml_content)
        lines = []
        for elem in root.findall(".//text"):
            text = elem.text or ""
            text = html.unescape(text).strip()
            if text:
                lines.append(text)
        return " ".join(lines)
    except Exception:
        # Fallback to regex text extraction if XML parse fails
        raw_texts = re.findall(r'<text[^>]*>(.*?)</text>', xml_content, re.DOTALL)
        lines = [html.unescape(t).strip() for t in raw_texts if t.strip()]
        return " ".join(lines)


def extract_youtube(url: str, *, transport: httpx.BaseTransport | None = None) -> ExtractedContent:
    """Extract transcript and title from a YouTube video URL."""
    video_id = extract_video_id(url)
    if not video_id:
        raise ExtractionError("That does not look like a valid YouTube video URL")

    # Normalize url to standard watch URL
    watch_url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        page = fetch_page(watch_url, transport=transport)
    except (FetchError, UnsafeURLError) as error:
        raise ExtractionError(str(error)) from None

    html_text = page.content.decode("utf-8", errors="replace")
    title = _extract_title(html_text) or f"YouTube Video ({video_id})"

    captions_url = _extract_captions_url(html_text)
    if not captions_url:
        raise ExtractionError(
            "No captions or transcript could be found for that YouTube video. "
            "RabbitHole requires accessible captions to analyze videos."
        )

    # Fetch captions XML
    try:
        safe_captions_url = validate_public_url(captions_url)
        with httpx.Client(transport=transport, timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.get(safe_captions_url)
            if resp.status_code != 200 or not resp.content:
                raise ExtractionError("Could not download the transcript for that video")
            transcript = parse_timedtext_xml(resp.content.decode("utf-8", errors="replace"))
    except (httpx.HTTPError, UnsafeURLError):
        raise ExtractionError("Could not retrieve captions from YouTube") from None

    cleaned_text = re.sub(r"\s+", " ", transcript).strip()
    if not cleaned_text or len(cleaned_text) < 50:
        raise ExtractionError(
            "The transcript for that YouTube video was too short or empty."
        )

    return ExtractedContent(title=title, text=cleaned_text[:MAX_TEXT_CHARS])
