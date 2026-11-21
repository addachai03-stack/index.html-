import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from animated_captions import write_animated, safe_text
from speech_quality import group_word_timings
from studio import Segment, Candidate

class AnimatedTests(unittest.TestCase):
    def test_retained_asr_word_boundaries(self):
        groups = []
        words = [SimpleNamespace(start=2.1,end=2.4,word="आप"),
                 SimpleNamespace(start=2.55,end=3.2,word="कैसे"),
                 SimpleNamespace(start=3.3,end=3.6,word="हैं?")]
        phrases = group_word_timings(words,word_groups=groups)
        seg = Segment(*phrases[0],groups[0])
        cut = Candidate(2,17,1,"test","","test")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"clip.ass"
            counts = write_animated(cut,[seg],p,"roman")
            self.assertEqual(counts,{"asr_words":3,"estimated":0})
            text = p.read_text()
            self.assertIn(r"0:00:00.10,0:00:00.40,Spoken,,0,0,0,,{\c&H00EBFF&}aap", text)
            self.assertIn(r"{\c&H00EBFF&}kaise",text)
            self.assertIn("0:00:01.30,0:00:01.60",text)

    def test_estimated_timing_and_trim(self):
        cut = Candidate(2,17,1,"","","")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"clip.ass"
            self.assertEqual(write_animated(cut,[Segment(1,4,"one two three")],p),
                {"asr_words":0,"estimated":2})
            self.assertNotIn("one ",p.read_text())
            self.assertIn("0:00:00.00,0:00:01.00",p.read_text())

    def test_no_speech_and_escape(self):
        self.assertNotIn("{",safe_text(r"{\pos(0,0)}"))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"clip.ass"
            self.assertEqual(write_animated(Candidate(0,15,0,"","",""),[],p),
                {"asr_words":0,"estimated":0})
            self.assertFalse(p.exists())
