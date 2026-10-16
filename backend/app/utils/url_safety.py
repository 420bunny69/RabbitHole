"""Protection against SSRF (server-side request forgery).

Our server will download whatever URL a visitor submits. Without checks, someone could submit
http://localhost:8000/... or http://169.254.169.254/... (a cloud provider's metadata service)
and make OUR server read internal data for them. This module decides whether a URL is safe to fetch.

Known limitation: DNS is resolved here and again when the page is actually downloaded, so a
hostile DNS server could answer differently the second time ("DNS rebinding"). The fetcher
(app/services/fetcher.py) re-checks every redirect hop, but does NOT yet connect to the checked
IP, so this small window remains. Pinning the connection to the checked IP is future hardening.
"""

import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit

ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_PORTS = {None, 80, 443}  # blocks probing internal services on odd ports (22, 5432, ...)
MAX_URL_LENGTH = 2048

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


class UnsafeURLError(ValueError):
    """The URL must not be fetched. The message is safe to show to the visitor."""


def _is_public_ip(ip: IPAddress) -> bool:
    # "::ffff:127.0.0.1" is an IPv6 spelling of 127.0.0.1, so unwrap it before checking.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _resolve(hostname: str) -> list[IPAddress]:
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise UnsafeURLError("Could not resolve that website's address") from None
    ips = [ipaddress.ip_address(info[4][0].split("%")[0]) for info in infos]
    if not ips:
        raise UnsafeURLError("Could not resolve that website's address")
    return ips


def validate_public_url(url: str) -> str:
    """Return a cleaned URL if it is safe to fetch, otherwise raise UnsafeURLError."""
    url = (url or "").strip()
    if not url:
        raise UnsafeURLError("URL is empty")
    if len(url) > MAX_URL_LENGTH:
        raise UnsafeURLError("URL is too long")
    if any(ch.isspace() or ord(ch) < 32 for ch in url):
        raise UnsafeURLError("URL contains invalid characters")

    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise UnsafeURLError("URL is malformed") from None

    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeURLError("Only http and https URLs are allowed")
    if "@" in parts.netloc:
        raise UnsafeURLError("URLs with a username or password are not allowed")
    if port not in ALLOWED_PORTS:
        raise UnsafeURLError("Only the standard web ports (80 and 443) are allowed")

    host = parts.hostname
    if not host:
        raise UnsafeURLError("URL has no host name")

    try:
        ips = [ipaddress.ip_address(host)]  # the host is already an IP address
    except ValueError:
        ips = _resolve(host)  # a name: check every address it points to

    if not all(_is_public_ip(ip) for ip in ips):
        raise UnsafeURLError("That URL points to a private or internal address")

    return urlunsplit(parts._replace(fragment=""))
