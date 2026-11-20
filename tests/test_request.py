import unittest
from unittest.mock import patch
from parse_request import parse_issue

BODY = """CUTNOVA_REQUEST_V1
URL: https://remotion.media/video-30s.mp4
CLIPS: 3
MIN_SECONDS: 15
MAX_SECONDS: 45
RIGHTS: YES
"""

class TestIssueRequest(unittest.TestCase):
    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("1.1.1.1",443))])
    def test_valid_request(self, _):
        parsed = parse_issue(BODY)
        self.assertEqual(parsed["video_url"], "https://remotion.media/video-30s.mp4")
        self.assertEqual(parsed["clips"], 3)
        self.assertEqual(parsed["min_sec"], 15)
        self.assertEqual(parsed["max_sec"], 45)

    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("1.1.1.1",443))])
    def test_missing_rights(self, _):
        with self.assertRaises(ValueError):
            parse_issue(BODY.replace("RIGHTS: YES","RIGHTS: NO"))

    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("1.1.1.1",443))])
    def test_invalid_range(self, _):
        with self.assertRaises(ValueError):
            parse_issue(BODY.replace("MIN_SECONDS: 15","MIN_SECONDS: 60"))
