
"""Extract transcripts and metadata from YouTube videos."""
import os
import time
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
    """Parse YouTube captions in XML, JSON3, or WebVTT format."""
    content = xml_content.strip()

    if not content:
        return ""

    # YouTube JSON3 captions
    try:
        data = json.loads(content)
        if isinstance(data, dict) and isinstance(data.get("events"), list):
            parts = []
            for event in data["events"]:
                for segment in event.get("segs") or []:
                    text = segment.get("utf8", "")
                    if text.strip():
                        parts.append(text)
            return re.sub(r"\s+", " ", "".join(parts)).strip()
    except (json.JSONDecodeError, ValueError):
        pass

    # WebVTT captions
    if content.startswith("WEBVTT"):
        lines = []
        for line in content.splitlines():
            line = line.strip()
            if (
                not line
                or line == "WEBVTT"
                or "-->" in line
                or line.isdigit()
            ):
                continue
            lines.append(line)
        return re.sub(r"\s+", " ", " ".join(lines)).strip()

    # XML captions
    try:
        root = ET.fromstring(content)
        lines = []

        for element in root.iter():
            if element.tag.split("}")[-1] == "text":
                text = "".join(element.itertext()).strip()
                if text:
                    lines.append(html.unescape(text))

        return re.sub(r"\s+", " ", " ".join(lines)).strip()

    except ET.ParseError:
        return ""



def extract_youtube(
    url: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> ExtractedContent:
    """Extract a YouTube transcript using Supadata."""
    video_id = extract_video_id(url)

    if not video_id:
        raise ExtractionError(
            "That does not look like a valid YouTube video URL"
        )

    api_key = os.getenv("SUPADATA_API_KEY")
    if not api_key:
        raise ExtractionError(
            "YouTube transcript service is not configured. "
            "Check SUPADATA_API_KEY in the backend environment."
        )

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    title = f"YouTube Video ({video_id})"
    headers = {"x-api-key": api_key}
    base_url = "https://api.supadata.ai/v1"

    try:
        # Title retrieval is best-effort; transcript extraction is
        # handled separately so a blocked YouTube page won't stop it.
        try:
            page = fetch_page(watch_url, transport=transport)
            html_text = page.content.decode("utf-8", errors="replace")
            title = _extract_title(html_text) or title
        except (FetchError, UnsafeURLError, httpx.HTTPError):
            logger.info("Could not retrieve YouTube page title")

        with httpx.Client(
            transport=transport,
            timeout=httpx.Timeout(20.0, connect=5.0),
            follow_redirects=True,
        ) as client:
            response = client.get(
                f"{base_url}/transcript",
                params={
                    "url": watch_url,
                    "lang": "en",
                    "text": "true",
                    "mode": "auto",
                },
                headers=headers,
            )

            if response.status_code == 206:
                raise ExtractionError(
                    "No usable transcript is available for this video."
                )

            if response.status_code not in (200, 202):
                logger.warning(
                    "Supadata transcript request failed: status=%s",
                    response.status_code,
                )

                messages = {
                    401: "Supadata rejected the API key. Check "
                         "SUPADATA_API_KEY in your backend .env file.",
                    402: "Supadata has insufficient credits. Check "
                         "your account usage and plan.",
                    403: "Supadata denied this request. Check your "
                         "account permissions.",
                    404: "Supadata could not find this video.",
                    429: "Supadata rate limit reached. Try again later.",
                }
                raise ExtractionError(
                    messages.get(
                        response.status_code,
                        "Supadata could not retrieve this transcript.",
                    )
                )

            data = response.json()

            # Large transcripts may be processed asynchronously.
            if response.status_code == 202 or data.get("jobId"):
                job_id = data.get("jobId")
                if not job_id:
                    raise ExtractionError(
                        "Supadata returned an invalid transcript job."
                    )

                for _ in range(60):
                    time.sleep(1)
                    result = client.get(
                        f"{base_url}/transcript/{job_id}",
                        headers=headers,
                    )

                    if result.status_code != 200:
                        raise ExtractionError(
                            "Could not retrieve the processed transcript."
                        )

                    data = result.json()
                    status = data.get("status")

                    if status == "completed":
                        break

                    if status == "failed":
                        raise ExtractionError(
                            "Supadata could not generate this transcript."
                        )
                else:
                    raise ExtractionError(
                        "Transcript processing timed out. Please retry."
                    )

            content = data.get("content", "")

            if isinstance(content, list):
                transcript = " ".join(
                    str(chunk.get("text", ""))
                    for chunk in content
                    if isinstance(chunk, dict)
                )
            elif isinstance(content, str):
                transcript = content
            else:
                transcript = ""

    except ExtractionError:
        raise
    except (httpx.HTTPError, ValueError) as error:
        logger.warning(
            "Supadata transcript request failed: %s",
            type(error).__name__,
        )
        raise ExtractionError(
            "Could not retrieve the YouTube transcript. "
            "Check your connection and try again."
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

