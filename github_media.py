"""Owner-only GitHub Issue video attachment downloader.

Only public GitHub user-attachment media links are accepted. The downloader
does not use browser cookies, tokens, private GitHub APIs, login or DRM bypass.
Redirects must stay on GitHub-operated asset hosts and all resolved IPs must
be public. File content is capped to GitHub's advertised 100 MB video limit.

This cannot make YouTube downloadable; users must upload their own authorized
file and understand that public repository issue attachments are public.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from pathlib import Path
from urllib.parse import urljoin, urlparse

MAX_UPLOAD_BYTES = 100 * 1000 * 1000
GH_ATTACHMENT = re.compile(
    r"^/user-attachments/assets/[a-f0-9]{8}-[a-f0-9]{4}-"
    r"[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/?$", flags=re.I
)


def is_github_attachment_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return (p.scheme == "https" and p.hostname == "github.com"
                and not p.username and not p.password and p.port is None
                and not p.fragment and bool(GH_ATTACHMENT.fullmatch(p.path)))
    except ValueError:
        return False


def is_github_asset_redirect_host(host: str) -> bool:
    host = host.lower().rstrip(".")
    return (host == "github.com"
            or host == "objects.githubusercontent.com"
            or host == "media.githubusercontent.com"
            or bool(re.fullmatch(
                r"github-production-user-asset-[a-z0-9-]+\.s3"
                r"(?:[.-][a-z0-9-]+)?\.amazonaws\.com", host))
            or bool(re.fullmatch(
                r"github-production-user-asset-[a-z0-9-]+"
                r"\.s3\.amazonaws\.com", host)))


def assert_public_github_asset_endpoint(url: str) -> None:
    p = urlparse(url)
    if (p.scheme != "https" or not p.hostname or
            p.username or p.password or p.port is not None or
            not is_github_asset_redirect_host(p.hostname)):
        raise ValueError("GitHub upload redirected outside permitted HTTPS asset hosts.")
    try:
        addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("GitHub media asset host could not be resolved.") from exc
    if not addresses or any(not ipaddress.ip_address(entry[4][0]).is_global
                            for entry in addresses):
        raise ValueError("GitHub media asset host resolved to a non-public IP.")


def download_github_attachment(url: str, work: Path) -> Path:
    """Stream one public GitHub Issues video attachment into a local MP4 path."""
    if not is_github_attachment_url(url):
        raise ValueError("Only official GitHub user-attachments/assets links accepted.")
    import requests

    work.mkdir(parents=True, exist_ok=True)
    target = work / "source.mp4"  # FFprobe reads actual container, not suffix.
    current = url
    try:
        with requests.Session() as session:
            for _ in range(7):
                assert_public_github_asset_endpoint(current)
                with session.get(current, stream=True, allow_redirects=False,
                                 timeout=(15, 50), headers={
                                     "User-Agent": "CutNova-GitHub-AuthorizedUpload/1.0",
                                     "Accept": "application/octet-stream,*/*"
                                 }) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        if not location:
                            raise RuntimeError("GitHub attachment redirect lacked a destination.")
                        next_url = urljoin(current, location)
                        assert_public_github_asset_endpoint(next_url)
                        current = next_url
                        continue
                    if response.status_code != 200:
                        raise RuntimeError(
                            "GitHub video attachment not publicly accessible (HTTP " +
                            str(response.status_code) + ")."
                        )
                    mime = response.headers.get("content-type", "").lower().split(";")[0]
                    if mime.startswith("text/") or mime in (
                            "application/json", "application/xml", "text/html"):
                        raise RuntimeError("GitHub returned a webpage, not the uploaded video.")
                    size = response.headers.get("content-length")
                    if size and int(size) > MAX_UPLOAD_BYTES:
                        raise ValueError("GitHub uploaded video exceeds 100 MB.")
                    received = 0
                    with target.open("wb") as dest:
                        for block in response.iter_content(chunk_size=256 * 1024):
                            if not block:
                                continue
                            received += len(block)
                            if received > MAX_UPLOAD_BYTES:
                                raise ValueError("GitHub uploaded video exceeds 100 MB.")
                            dest.write(block)
                    if received < 4096:
                        raise RuntimeError("GitHub uploaded video is empty/too small.")
                    print("Downloaded GitHub Issue attachment:", received,
                          "bytes (source rights confirmed by request).", flush=True)
                    return target
            raise RuntimeError("Too many GitHub upload redirects.")
    except Exception:
        target.unlink(missing_ok=True)
        raise
