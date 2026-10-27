
"""Extract transcripts and metadata from YouTube videos."""

import html
import json
import logging
import re
from urllib.parse import parse_qs, urlsplit
import xml.etree.ElementTree as ET

import httpx

from app.services.extractors.base import (
    MAX_TEXT_CHARS,
    ExtractedContent,
    ExtractionError,
)
from app.services.fetcher import FetchError, fetch_page
from app.utils.url_safety import UnsafeURLError, validate_public_url

logger = logging.getLogger(__name__)

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
}


def extract_video_id(url: str) -> str | None:
    """Extract the 11-character video ID from a YouTube URL."""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()

    if host not in YOUTUBE_HOSTS and not any(
        host.endswith("." + h) for h in ("youtube.com", "youtu.be")
    ):
        return None

    if host == "youtu.be":
        path = parsed.path.strip("/")
        return path[:11] if len(path) >= 11 else None

    if parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v")
        if video_id and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id[0]):
            return video_id[0]

    match = re.search(
        r"/(?:shorts|embed)/([A-Za-z0-9_-]{11})",
        parsed.path,
    )
    return match.group(1) if match else None


def _extract_title(html_content: str) -> str | None:
    """Extract the video title from YouTube page HTML."""
    patterns = (
        r'<meta\s+property=["\']og:title["\']\s+content=["\'](.*?)["\']',
        r'<title>(.*?)</title>',
    )

    for pattern in patterns:
        match = re.search(pattern, html_content, re.IGNORECASE)
        if match:
            return html.unescape(match.group(1)).replace(
                " - YouTube", ""
            ).strip()

    return None


def _extract_captions_url(html_content: str) -> str | None:
    """Extract a caption-track URL from YouTube player response JSON."""
    markers = (
        "ytInitialPlayerResponse",
        "playerResponse",
    )

    for marker in markers:
        position = html_content.find(marker)
        if position == -1:
            continue

        start = html_content.find("{", position + len(marker))
        if start == -1:
            continue

        # Find the end of the JSON object while respecting strings.
        depth = 0
        in_string = False
        escaped = False
        end = None

        for index in range(start, len(html_content)):
            char = html_content[index]

            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break

        if end is None:
            continue

        try:
            data = json.loads(html_content[start:end])
        except (json.JSONDecodeError, ValueError):
            continue

        captions = data.get("captions") or {}
        tracklist = captions.get("playerCaptionsTracklistRenderer") or {}
        tracks = tracklist.get("captionTracks") or []

        if tracks:
            for track in tracks:
                if track.get("languageCode", "").lower().startswith("en"):
                    if track.get("baseUrl"):
                        return track["baseUrl"]

            if tracks[0].get("baseUrl"):
                return tracks[0]["baseUrl"]

    # Fallback: locate captionTracks JSON in the page.
    match = re.search(r'"captionTracks"\s*:\s*(\[)', html_content)
    if match:
        start = match.start(1)
        depth = 0
        in_string = False
        escaped = False

        for index in range(start, len(html_content)):
            char = html_content[index]

            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    try:
                        tracks = json.loads(html_content[start:index + 1])
                        if tracks:
                            return tracks[0].get("baseUrl")
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break

    return None


def parse_timedtext_xml(xml_content: str) -> str:
    """Parse YouTube timed-text XML into plain text."""
    try:
        root = ET.fromstring(xml_content)
        lines = []

        for element in root.iter():
            if element.tag.split("}")[-1] == "text":
                text = html.unescape("".join(element.itertext())).strip()
                if text:
                    lines.append(text)

        return " ".join(lines)

    except ET.ParseError:
        raw_texts = re.findall(
            r"<text[^>]*>(.*?)</text>",
            xml_content,
            re.DOTALL,
        )
        return " ".join(html.unescape(text).strip() for text in raw_texts)


def extract_youtube(
    url: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> ExtractedContent:
    """Extract the title and accessible transcript from a YouTube video."""
    video_id = extract_video_id(url)

    if not video_id:
        raise ExtractionError(
            "That does not look like a valid YouTube video URL"
        )

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
            "The video may not expose accessible captions."
        )

    try:
        safe_captions_url = validate_public_url(captions_url)

        with httpx.Client(
            transport=transport,
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=True,
        ) as client:
            response = client.get(safe_captions_url)

            if response.status_code != 200 or not response.content:
                logger.warning(
                    "YouTube transcript download failed: status=%s, "
                    "content_length=%s, content_type=%s, final_url=%s",
                    response.status_code,
                    len(response.content),
                    response.headers.get("content-type"),
                    str(response.url).split("?")[0],
                )
                raise ExtractionError(
                    "YouTube returned an empty transcript. "
                    "The caption track may be unavailable."
                )

            transcript = parse_timedtext_xml(
                response.content.decode("utf-8", errors="replace")
            )

    except (httpx.HTTPError, UnsafeURLError):
        logger.exception("YouTube caption request failed")
        raise ExtractionError(
            "Could not retrieve captions from YouTube"
        ) from None

    cleaned_text = re.sub(r"\s+", " ", transcript).strip()

    if len(cleaned_text) < 50:
        raise ExtractionError(
            "The transcript was empty or too short to analyze."
        )

    return ExtractedContent(
        title=title,
        text=cleaned_text[:MAX_TEXT_CHARS],
    )

