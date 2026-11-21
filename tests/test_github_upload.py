"""Unit tests for owner-only GitHub Issue media uploads and URL/attachment parsing."""
from __future__ import annotations

import io
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from github_media import (
    MAX_UPLOAD_BYTES,
    assert_public_github_asset_endpoint,
    download_github_attachment,
    is_github_attachment_url,
    is_github_asset_redirect_host,
)
from parse_request import parse_issue

UUID = "12c59aaa-c7be-46cf-8741-fa2b6e88b12f"
ASSET = "https://github.com/user-attachments/assets/" + UUID
CDN = "https://github-production-user-asset-6210df.s3.amazonaws.com/attachments/sample.mp4"
RIGHTS = "I own this video or have permission to edit and republish its content."


def issue(source: str = "", upload: str = "") -> str:
    return f"""### Video URL

{source or '_No response_'}

### Upload your video file

{upload or '_No response_'}

### Number of Shorts

6

### Minimum clip length (seconds)

30

### Maximum clip length (seconds)

60

### Highlight style

Engagement — strong hooks and reveals

### Speech language

Auto — detect language

### Smart crop mode

Auto — face-aware static framing

### Content ownership and permission

- [X] {RIGHTS}
"""


PUBLIC_DNS = [(2, 1, 6, "", ("140.82.113.3", 443))]
PRIVATE_DNS = [(2, 1, 6, "", ("127.0.0.1", 443))]


class TestOfficialGithubLinks(unittest.TestCase):
    def test_accept_asset_only(self):
        self.assertTrue(is_github_attachment_url(ASSET))
        self.assertTrue(is_github_asset_redirect_host("objects.githubusercontent.com"))
        self.assertTrue(is_github_asset_redirect_host(
            "github-production-user-asset-6210df.s3.amazonaws.com"))

    def test_reject_other_github_paths(self):
        for url in (
            "https://github.com/openai/not-an-attachment",
            "https://evil.example.com/user-attachments/assets/" + UUID,
            "http://github.com/user-attachments/assets/" + UUID,
            "https://github.com/user-attachments/assets/NOT-UUID",
            "https://github.com:444/user-attachments/assets/" + UUID,
        ):
            self.assertFalse(is_github_attachment_url(url), url)

    @patch("github_media.socket.getaddrinfo", return_value=PRIVATE_DNS)
    def test_private_dns_rejected(self, _):
        with self.assertRaisesRegex(ValueError, "non-public"):
            assert_public_github_asset_endpoint(ASSET)

    @patch("github_media.socket.getaddrinfo", return_value=PUBLIC_DNS)
    def test_external_redirect_host_rejected(self, _):
        with self.assertRaisesRegex(ValueError, "outside"):
            assert_public_github_asset_endpoint("https://evil.com/own.mp4")


class TestIssueFileUpload(unittest.TestCase):
    @patch("studio.socket.getaddrinfo", return_value=PUBLIC_DNS)
    def test_form_github_upload_only(self, _):
        request = parse_issue(issue(upload=ASSET))
        self.assertEqual(request["video_url"], ASSET)
        self.assertEqual(request["clips"], 6)

    @patch("studio.socket.getaddrinfo", return_value=PUBLIC_DNS)
    def test_markdown_upload(self, _):
        request = parse_issue(issue(
            upload="[my-original-video.mp4](" + ASSET + ")"
        ))
        self.assertEqual(request["video_url"], ASSET)

    @patch("studio.socket.getaddrinfo", return_value=PUBLIC_DNS)
    def test_regular_url_only_back_compat(self, _):
        video = "https://remotion.media/video-30s.mp4"
        request = parse_issue(issue(source=video))
        self.assertEqual(request["video_url"], video)

    @patch("studio.socket.getaddrinfo", return_value=PUBLIC_DNS)
    def test_reject_both_or_neither(self, _):
        with self.assertRaisesRegex(ValueError, "exactly ONE"):
            parse_issue(issue())
        with self.assertRaisesRegex(ValueError, "exactly ONE"):
            parse_issue(issue(source="https://remotion.media/video-30s.mp4",
                              upload=ASSET))

    def test_reject_non_official_attachment(self):
        with self.assertRaises(ValueError):
            parse_issue(issue(upload="[x.mp4](https://evil.example.com/x.mp4)"))

    def test_reject_multiple_attachments(self):
        with self.assertRaises(ValueError):
            parse_issue(issue(upload=ASSET + "\n" + ASSET))

    def test_reject_unconfirmed_rights(self):
        with self.assertRaises(ValueError):
            parse_issue(issue(upload=ASSET).replace("- [X]", "- [ ]"))


class FakeResponse:
    def __init__(self, status_code, payload=b"", location=None, mime="video/mp4"):
        self.status_code = status_code
        self.headers = {"content-type": mime}
        if location:
            self.headers["location"] = location
        if payload:
            self.headers["content-length"] = str(len(payload))
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def iter_content(self, chunk_size=1024):
        yield self.payload


class FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.requested = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, **kwargs):
        self.requested.append((url, kwargs))
        return self.responses.pop(0)


class TestUploadDownloader(unittest.TestCase):
    def test_redirect_and_real_bytes_streamed(self):
        session = FakeSession([
            FakeResponse(302, location=CDN),
            FakeResponse(200, payload=b"X" * 8192),
        ])
        fake_requests = types.SimpleNamespace(Session=lambda: session)
        with tempfile.TemporaryDirectory() as temp:
            with patch.dict(sys.modules, {"requests": fake_requests}):
                with patch("github_media.socket.getaddrinfo",
                           return_value=PUBLIC_DNS):
                    result = download_github_attachment(ASSET, Path(temp))
            self.assertEqual(result.read_bytes(), b"X" * 8192)
            self.assertEqual(len(session.requested), 2)
            self.assertFalse(session.requested[0][1]["allow_redirects"])

    def test_html_page_not_saved(self):
        session = FakeSession([FakeResponse(200, b"<html>" * 1000,
                                            mime="text/html")])
        with tempfile.TemporaryDirectory() as temp:
            with patch.dict(sys.modules, {
                "requests": types.SimpleNamespace(Session=lambda: session)
            }):
                with patch("github_media.socket.getaddrinfo",
                           return_value=PUBLIC_DNS):
                    with self.assertRaisesRegex(RuntimeError, "webpage"):
                        download_github_attachment(ASSET, Path(temp))
            self.assertFalse((Path(temp) / "source.mp4").exists())

    def test_reject_offsite_redirect(self):
        session = FakeSession([FakeResponse(
            302, location="https://127.0.0.1/hidden.mp4")])
        with tempfile.TemporaryDirectory() as temp:
            with patch.dict(sys.modules, {
                "requests": types.SimpleNamespace(Session=lambda: session)
            }):
                with patch("github_media.socket.getaddrinfo",
                           return_value=PUBLIC_DNS):
                    with self.assertRaises(ValueError):
                        download_github_attachment(ASSET, Path(temp))


if __name__ == "__main__":
    unittest.main()
