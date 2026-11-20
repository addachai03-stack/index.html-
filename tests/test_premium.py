import csv
import tempfile
import unittest
from pathlib import Path

from premium import (
    create_creator_pack, distribute_subtitles, highlight_bonus, normalize_style,
    text_fragments,
)
from studio import Candidate, Segment, captions_for, pick_clips


class TestPremiumScoring(unittest.TestCase):
    def test_funny_mode_rewards_comedy_speech(self):
        funny = "This funny joke made me laugh haha, hilarious reaction!"
        self.assertGreater(highlight_bonus(funny, "funny"),
                           highlight_bonus(funny, "facts"))

    def test_facts_mode_rewards_explaining(self):
        text = "Did you know how this works? Because science gives us the reason."
        self.assertGreater(highlight_bonus(text, "facts"),
                           highlight_bonus(text, "funny"))

    def test_unsupported_mode_rejected(self):
        with self.assertRaises(ValueError):
            normalize_style("live-trending")
        with self.assertRaises(ValueError):
            pick_clips([], [], 70, requested=2, style="unknown")

    def test_mode_changes_ranked_score(self):
        words = [Segment(10, 19, "Haha this was a hilarious joke funny reaction")]
        funny = pick_clips(words, [], 35, requested=1, style="funny")
        facts = pick_clips(words, [], 35, requested=1, style="facts")
        self.assertGreater(funny[0].score, facts[0].score)


class TestPremiumCaptions(unittest.TestCase):
    def test_text_kept_without_loss(self):
        text = "Here is the really important explanation about why the entire cartoon scene matters today."
        parts = text_fragments(text, max_chars=32)
        self.assertGreater(len(parts), 1)
        self.assertEqual(" ".join(parts), text)
        self.assertTrue(all(len(p) <= 32 for p in parts))

    def test_hindi_hinglish_caption_chunks(self):
        long_line = "ये एक बहुत बड़ी जानकारी है और फिर दूसरा interesting moment आता है जो सबको अच्छा लगता है"
        parts = text_fragments(long_line, max_chars=36)
        self.assertGreater(len(parts), 1)
        self.assertEqual(" ".join(parts), long_line)

    def test_subtitle_timing_bounded(self):
        pieces = distribute_subtitles(3.0, 13.0, "word " * 24, 5.0, 11.0, max_chars=34)
        self.assertGreater(len(pieces), 1)
        self.assertEqual(pieces[0][0], 0)
        self.assertEqual(pieces[-1][1], 6)
        for i, (start, end, text) in enumerate(pieces):
            self.assertLess(start, end)
            self.assertGreaterEqual(start, 0)
            self.assertLessEqual(end, 6)
            self.assertTrue(text)
            if i:
                self.assertGreaterEqual(start, pieces[i-1][1])

    def test_srt_no_truncated_dialogue(self):
        cut = Candidate(0, 20, 0.6, "A", "", "speech")
        spoken = "This is the full meaningful dialogue with a rather long sentence and several useful words in its explanation"
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "clip.srt"
            self.assertTrue(captions_for(cut, [Segment(1, 17, spoken)], path))
            content = path.read_text(encoding="utf-8")
            self.assertIn("This is the full", content)
            self.assertIn("its explanation", content)
            self.assertNotIn("...", content)


class TestPostingGuide(unittest.TestCase):
    def test_markdown_csv_source_grounding(self):
        cuts = [Candidate(10.0, 25.0, 0.8, "from source",
                          "This is the actual voice actor's story, dekho", "speech")]
        with tempfile.TemporaryDirectory() as d:
            guide, csvpath = create_creator_pack(cuts, Path(d),
                                                 "engagement",
                                                 "https://example.com/owned-video.mp4")
            txt = guide.read_text(encoding="utf-8")
            self.assertIn("This is the actual voice", txt)
            self.assertIn("NOT live social trends", txt)
            with csvpath.open(encoding="utf-8-sig", newline="") as f:
                rows = list(csv.DictReader(f))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["start_seconds"], "10.0")
            self.assertEqual(rows[0]["style"], "engagement")

    def test_missing_asr_has_no_invented_claims(self):
        cuts = [Candidate(0, 15, 0.1, "Scene highlight", "", "timed fallback")]
        with tempfile.TemporaryDirectory() as d:
            guide, csvpath = create_creator_pack(cuts, Path(d), "story",
                                                 "https://example.com/own.mp4")
            txt = guide.read_text(encoding="utf-8")
            self.assertIn("No — review visuals manually", txt)
            self.assertIn("Story moment", txt)


if __name__ == "__main__":
    unittest.main()
