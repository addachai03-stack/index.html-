import unittest
from unittest.mock import patch
from parse_request import parse_issue

LEGACY = """CUTNOVA_REQUEST_V1
URL: https://remotion.media/video-30s.mp4
CLIPS: 3
MIN_SECONDS: 15
MAX_SECONDS: 45
RIGHTS: YES
"""

NATIVE_FORM = """### Video URL

https://remotion.media/video-30s.mp4

### Number of Shorts

6

### Minimum clip length (seconds)

15

### Maximum clip length (seconds)

60

### Highlight style

Funny — jokes and reactions

### Content ownership and permission

- [X] I own this video or have permission to edit and republish its content.
"""


class TestIssueRequest(unittest.TestCase):
    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_old_prefilled_url(self, _):
        result = parse_issue(LEGACY)
        self.assertEqual(result["video_url"], "https://remotion.media/video-30s.mp4")
        self.assertEqual(result["clips"], 3)
        self.assertEqual(result["min_sec"], 15)
        self.assertEqual(result["max_sec"], 45)

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_issue_form(self, _):
        result = parse_issue(NATIVE_FORM)
        self.assertEqual(result["video_url"], "https://remotion.media/video-30s.mp4")
        self.assertEqual(result["clips"], 6)
        self.assertEqual(result["min_sec"], 15)
        self.assertEqual(result["max_sec"], 60)

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_highlight_style(self, _):
        result = parse_issue(NATIVE_FORM)
        self.assertEqual(result["style"], "funny")

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_legacy_style_default(self, _):
        result = parse_issue(LEGACY)
        self.assertEqual(result["style"], "engagement")

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_unknown_style_rejected(self, _):
        with self.assertRaises(ValueError):
            parse_issue(NATIVE_FORM.replace("Funny — jokes and reactions", "Viral guaranteed"))

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_no_rights(self, _):
        with self.assertRaises(ValueError):
            parse_issue(NATIVE_FORM.replace("- [X]", "- [ ]"))

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_invalid_time_range(self, _):
        with self.assertRaises(ValueError):
            parse_issue(NATIVE_FORM.replace("### Minimum clip length (seconds)\n\n15", "### Minimum clip length (seconds)\n\n90"))

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_multiline_url_rejected(self, _):
        with self.assertRaises(ValueError):
            parse_issue(NATIVE_FORM.replace("https://remotion.media/video-30s.mp4", "https://remotion.media/video-30s.mp4\nmalicious second line"))

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_native_duplicate_url_rejected(self, _):
        with self.assertRaises(ValueError):
            parse_issue(NATIVE_FORM + "\n### Video URL\n\nhttps://remotion.media/video-30s.mp4\n")

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_legacy_no_rights(self, _):
        with self.assertRaises(ValueError):
            parse_issue(LEGACY.replace("RIGHTS: YES", "RIGHTS: NO"))

    @patch("studio.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("1.1.1.1", 443))])
    def test_legacy_bad_range(self, _):
        with self.assertRaises(ValueError):
            parse_issue(LEGACY.replace("MIN_SECONDS: 15", "MIN_SECONDS: 60"))


if __name__ == "__main__":
    unittest.main()
