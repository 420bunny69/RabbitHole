import httpx
import pytest

from app.services import fetcher
from app.services.fetcher import FetchError, fetch_page
from app.utils.url_safety import UnsafeURLError
from app.config import Settings

def transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


def test_fetches_a_page(public_dns):
    page = fetch_page(
        "https://example.com/a", transport=transport(lambda r: httpx.Response(200, html="<p>hi</p>"))
    )
    assert page.content == b"<p>hi</p>"
    assert page.url == "https://example.com/a"


def test_sends_an_identifying_user_agent(public_dns):
    seen = {}

    def handler(request):
        seen["user_agent"] = request.headers["user-agent"]
        return httpx.Response(200, html="ok")

    fetch_page("https://example.com/", transport=transport(handler))
    assert "RabbitHoleBot" in seen["user_agent"]


def test_follows_a_redirect_to_a_public_page(public_dns):
    def handler(request):
        if request.url.path == "/old":
            return httpx.Response(301, headers={"location": "/new"})
        return httpx.Response(200, html="new page")

    page = fetch_page("https://example.com/old", transport=transport(handler))
    assert page.url == "https://example.com/new"
    assert page.content == b"new page"


@pytest.mark.parametrize(
    "target", ["http://internal.example.com/secret", "http://127.0.0.1/admin", "ftp://example.com/x"]
)
def test_redirect_to_an_unsafe_address_is_blocked(public_dns, target):
    requested = []

    def handler(request):
        requested.append(str(request.url))
        return httpx.Response(302, headers={"location": target})

    with pytest.raises(UnsafeURLError):
        fetch_page("https://example.com/start", transport=transport(handler))
    assert requested == ["https://example.com/start"]  # the unsafe target was never requested


def test_redirect_without_location_is_an_error(public_dns):
    with pytest.raises(FetchError, match="invalid redirect"):
        fetch_page("https://example.com/", transport=transport(lambda r: httpx.Response(302)))


def test_redirect_loop_is_stopped(public_dns):
    handler = lambda r: httpx.Response(302, headers={"location": "/again"})  # noqa: E731
    with pytest.raises(FetchError, match="too many times"):
        fetch_page("https://example.com/", transport=transport(handler))


def test_unsafe_start_url_never_hits_the_network(public_dns):
    def handler(request):
        raise AssertionError("no request should be made")

    with pytest.raises(UnsafeURLError):
        fetch_page("http://127.0.0.1/", transport=transport(handler))


def test_error_status_is_reported(public_dns):
    with pytest.raises(FetchError, match="404"):
        fetch_page("https://example.com/x", transport=transport(lambda r: httpx.Response(404)))


def test_non_web_content_is_rejected(public_dns):
    handler = lambda r: httpx.Response(  # noqa: E731
        200, content=b"%PDF-1.4", headers={"content-type": "application/pdf"}
    )
    with pytest.raises(FetchError, match="not a web page"):
        fetch_page("https://example.com/file.pdf", transport=transport(handler))


def test_oversized_page_is_rejected(public_dns, monkeypatch):
    monkeypatch.setattr(fetcher, "MAX_BYTES", 100)
    handler = lambda r: httpx.Response(200, content=b"x" * 500, headers={"content-type": "text/html"})  # noqa: E731
    with pytest.raises(FetchError, match="too large"):
        fetch_page("https://example.com/", transport=transport(handler))


def test_timeout_becomes_a_friendly_error(public_dns):
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(FetchError, match="too long"):
        fetch_page("https://example.com/", transport=transport(handler))


def test_connection_failure_becomes_a_friendly_error(public_dns):
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(FetchError, match="Could not reach"):
        fetch_page("https://example.com/", transport=transport(handler))
def test_user_agent_includes_the_contact_from_settings(public_dns, monkeypatch):
    monkeypatch.setattr(
        fetcher, "get_settings", lambda: Settings(fetch_contact="https://github.com/me/rabbithole")
    )
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, html="ok")

    fetch_page("https://example.com/", transport=transport(handler))
    assert seen["ua"] == "RabbitHoleBot/0.1 (https://github.com/me/rabbithole)"


@pytest.mark.parametrize("status", [401, 403, 429])
def test_blocked_access_suggests_pasting_text(public_dns, status):
    with pytest.raises(FetchError, match="Try pasting the text"):
        fetch_page("https://example.com/x", transport=transport(lambda r: httpx.Response(status)))