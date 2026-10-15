import socket

import pytest

from app.utils import url_safety
from app.utils.url_safety import UnsafeURLError, validate_public_url

FAKE_DNS = {
    "example.com": ["93.184.216.34"],
    "localhost": ["127.0.0.1"],
    "internal.example.com": ["10.0.0.5"],
    "mixed.example.com": ["93.184.216.34", "10.0.0.5"],
}


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch):
    """Tests must never touch the real network, so DNS is faked. Unknown names fail to resolve."""

    def fake_getaddrinfo(host, port, *args, **kwargs):
        if host not in FAKE_DNS:
            raise socket.gaierror("unknown host")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in FAKE_DNS[host]]

    monkeypatch.setattr(url_safety.socket, "getaddrinfo", fake_getaddrinfo)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/article",
        "http://example.com",
        "https://example.com:443/page",
        "https://93.184.216.34/page",
    ],
)
def test_public_urls_are_accepted(url):
    assert validate_public_url(url).startswith("http")


def test_fragment_is_removed_and_whitespace_trimmed():
    assert validate_public_url("  https://example.com/a#section  ") == "https://example.com/a"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "not a url",
        "ftp://example.com/file",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "//example.com/path",
        "https://",
        "https://user:pass@example.com/",
        "https://example.com@evil.com/",
        "https://example.com:8080/",
        "https://example.com:22/",
        "https://example.com:notaport/",
        "https://exa mple.com/",
        "https://example.com/" + "a" * 3000,
    ],
)
def test_malformed_or_disallowed_urls_are_rejected(url):
    with pytest.raises(UnsafeURLError):
        validate_public_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/",
        "http://0.0.0.0/",
        "http://10.0.0.1/",
        "http://172.16.5.4/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata service
        "http://100.64.0.1/",  # carrier-grade NAT range
        "http://[::1]/",
        "http://[fe80::1]/",
        "http://[fc00::1]/",
        "http://[::ffff:127.0.0.1]/",  # IPv4 loopback disguised as IPv6
        "http://2130706433/",  # 127.0.0.1 written as one big number
        "http://224.0.0.1/",  # multicast
    ],
)
def test_private_and_internal_addresses_are_rejected(url):
    with pytest.raises(UnsafeURLError):
        validate_public_url(url)


def test_hostname_that_resolves_to_private_ip_is_rejected():
    with pytest.raises(UnsafeURLError, match="private or internal"):
        validate_public_url("https://internal.example.com/")


def test_hostname_with_any_private_address_is_rejected():
    with pytest.raises(UnsafeURLError, match="private or internal"):
        validate_public_url("https://mixed.example.com/")


def test_unresolvable_hostname_is_rejected():
    with pytest.raises(UnsafeURLError, match="resolve"):
        validate_public_url("https://does-not-exist.example/")
