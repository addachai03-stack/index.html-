import unittest
from studio import validate_url
from parse_request import legacy_fields
class ReleaseSecurityTests(unittest.TestCase):
    def test_private_urls(self):
        for url in ("https://example.com/a.mp4?token=abc","https://example.com/a.mp4?X-Amz-Signature=x","https://ex.com/a.mp4\nRIGHTS: YES","https://user:pass@ex.com/a.mp4","https://ex.com:443/a.mp4","https://ex.com/a.mp4#x"):
            with self.assertRaises(ValueError): validate_url(url)
    def test_duplicate_settings(self):
        with self.assertRaises(ValueError): legacy_fields("URL: https://ex.com/a.mp4\nURL: https://ex.com/b.mp4")
