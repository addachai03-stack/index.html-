import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from roman_captions import romanize, caption_text, normalize_caption_script
from studio import captions_for, Segment, Candidate
from parse_request import parse_issue

class RomanCaptionTests(unittest.TestCase):
    def test_common_hindi_and_punctuation(self):
        self.assertEqual(romanize("आप कैसे हैं?"), "aap kaise hain?")
        self.assertEqual(romanize("आज वीडियो देखो।"), "aaj video dekho.")
        self.assertEqual(romanize("नमस्ते दोस्तों!"), "namaste doston!")
    def test_code_switch_and_digits(self):
        self.assertEqual(romanize("आज १२ AI shorts"), "aaj 12 AI shorts")
        self.assertEqual(romanize("English 100%"), "English 100%")
        self.assertEqual(romanize("किताब"), "kitaab")
    def test_original_and_invalid(self):
        self.assertEqual(caption_text("आप कैसे हैं?"), "आप कैसे हैं?")
        with self.assertRaises(ValueError):
            normalize_caption_script("bad")
    def test_srt_and_source_preservation(self):
        speech = [Segment(2, 4, "आप कैसे हैं?")]
        clip = Candidate(1, 16, .5, "test", "", "test")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "short.srt"
            orig = Path(d) / "short.original.srt"
            self.assertTrue(captions_for(clip, speech, p, "roman"))
            self.assertTrue(captions_for(clip, speech, orig))
            self.assertIn("00:00:01,000 --> 00:00:03,000", p.read_text())
            self.assertIn("aap kaise hain?", p.read_text())
            self.assertIn("आप कैसे हैं?", orig.read_text())
            self.assertEqual(speech[0].text, "आप कैसे हैं?")
    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("1.1.1.1",443))])
    def test_request_compatibility(self, _):
        request = "CUTNOVA_REQUEST_V1\nURL: https://remotion.media/video-30s.mp4\nCLIPS: 3\nMIN_SECONDS: 15\nMAX_SECONDS: 60\nRIGHTS: YES\n"
        self.assertEqual(parse_issue(request)["caption_script"], "original")
        self.assertEqual(parse_issue(request + "CAPTION_SCRIPT: roman\n")["caption_script"], "roman")
        with self.assertRaises(ValueError):
            parse_issue(request + "CAPTION_SCRIPT: invalid\n")
        form = """### Video URL

https://remotion.media/video-30s.mp4

### Number of Shorts

3

### Minimum clip length (seconds)

15

### Maximum clip length (seconds)

60

### Caption script

Roman — Hinglish (approximate)

### Content ownership and permission

- [X] I own this video or have permission to edit and republish its content.
"""
        self.assertEqual(parse_issue(form)["caption_script"], "roman")
