"""Extracts repository metadata and README text from public GitHub repositories."""

import logging
import re
from urllib.parse import urlsplit

import httpx

from app.services.extractors.base import MAX_TEXT_CHARS, ExtractedContent, ExtractionError
from app.services.fetcher import build_headers
from app.utils.url_safety import UnsafeURLError, validate_public_url

logger = logging.getLogger(__name__)

NON_REPO_PATHS = {
    "about", "features", "pricing", "security", "customer-stories",
    "enterprise", "explore", "topics", "trending", "collections",
    "events", "community", "marketplace", "login", "join", "settings",
    "notifications", "pulls", "issues"
}


def parse_github_repo(url: str) -> tuple[str, str] | None:
    """Parse owner and repo name from a GitHub URL."""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if host not in {"github.com", "www.github.com"}:
        return None

    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        return None

    owner, repo = parts[0], parts[1]
    if owner.lower() in NON_REPO_PATHS:
        return None

    # Strip .git suffix if present
    if repo.endswith(".git"):
        repo = repo[:-4]

    if not re.match(r"^[a-zA-Z0-9._-]+$", owner) or not re.match(r"^[a-zA-Z0-9._-]+$", repo):
        return None

    return owner, repo


def extract_github(url: str, *, transport: httpx.BaseTransport | None = None) -> ExtractedContent:
    """Extract information and README from a public GitHub repository."""
    parsed = parse_github_repo(url)
    if not parsed:
        raise ExtractionError("That does not look like a valid GitHub repository URL")

    owner, repo = parsed
    api_url = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        validate_public_url(api_url)
    except UnsafeURLError as error:
        raise ExtractionError(str(error)) from None

    headers = build_headers()
    headers["Accept"] = "application/vnd.github.v3+json"

    repo_data: dict = {}
    readme_text = ""

    timeout = httpx.Timeout(10.0, connect=5.0)
    with httpx.Client(transport=transport, timeout=timeout, headers=headers) as client:
        # 1. Fetch repo metadata
        try:
            resp = client.get(api_url)
            if resp.status_code == 404:
                raise ExtractionError(f"GitHub repository '{owner}/{repo}' was not found or is private")
            if resp.status_code == 200:
                repo_data = resp.json()
        except httpx.HTTPError:
            logger.debug("Failed to fetch repo metadata from GitHub API")

        # 2. Fetch README (try API first, then raw GitHub)
        try:
            readme_resp = client.get(
                f"{api_url}/readme",
                headers={"Accept": "application/vnd.github.raw+json"}
            )
            if readme_resp.status_code == 200:
                readme_text = readme_resp.text
        except httpx.HTTPError:
            pass

        if not readme_text:
            # Fallback to raw user content
            for branch in ("HEAD", "main", "master"):
                raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md"
                try:
                    raw_resp = client.get(raw_url)
                    if raw_resp.status_code == 200 and raw_resp.text:
                        readme_text = raw_resp.text
                        break
                except httpx.HTTPError:
                    continue

    description = (repo_data.get("description") or "").strip()
    language = repo_data.get("language") or ""
    topics = repo_data.get("topics") or []
    stars = repo_data.get("stargazers_count")

    title_parts = [f"{owner}/{repo}"]
    if description:
        title_parts.append(description)
    title = ": ".join(title_parts)[:500]

    # Clean markdown boilerplate from README
    cleaned_readme = re.sub(r"<!--.*?-->", "", readme_text, flags=re.DOTALL)
    cleaned_readme = re.sub(r"!\[.*?\]\(.*?\)", "", cleaned_readme)  # strip images
    cleaned_readme = re.sub(r"\n{3,}", "\n\n", cleaned_readme).strip()

    sections = []
    meta_info = []
    if description:
        meta_info.append(f"Description: {description}")
    if language:
        meta_info.append(f"Primary Language: {language}")
    if topics:
        meta_info.append(f"Topics: {', '.join(topics)}")
    if stars is not None:
        meta_info.append(f"Stars: {stars}")

    if meta_info:
        sections.append("Repository Overview:\n" + "\n".join(meta_info))

    if cleaned_readme:
        sections.append(f"README:\n{cleaned_readme}")

    full_text = "\n\n".join(sections).strip()
    if not full_text or len(full_text) < 50:
        raise ExtractionError(
            f"The repository '{owner}/{repo}' has no readable README or description to analyze"
        )

    return ExtractedContent(title=title, text=full_text[:MAX_TEXT_CHARS])
