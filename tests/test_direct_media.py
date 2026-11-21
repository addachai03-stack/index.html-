import unittest
from unittest.mock import patch
from direct_media import endpoint,media_kind
class DirectTests(unittest.TestCase):
    def test_media_signature(self):
        self.assertEqual(media_kind(b"\0\0\0\x18ftypisom"),".mp4")
        self.assertEqual(media_kind(b"\x1a\x45\xdf\xa3"),".webm")
        with self.assertRaises(ValueError): media_kind(b"#EXTM3U\nhttp://localhost/")
    @patch("direct_media.socket.getaddrinfo",return_value=[(2,1,6,"",("127.0.0.1",443))])
    def test_private(self,_):
        with self.assertRaises(ValueError): endpoint("https://example.com/a.mp4")
    @patch("direct_media.socket.getaddrinfo",return_value=[(2,1,6,"",("8.8.8.8",443))])
    def test_public(self,_):
        self.assertEqual(endpoint("https://example.com/a.mp4")[1],["8.8.8.8"])
