import unittest
from unittest.mock import patch
from studio import Segment, validate_url, pick_clips, stamp, score_window

class TestSafety(unittest.TestCase):
    def test_reject_unsafe_hosts(self):
        for url in ("http://youtube.com/watch?v=a", "file:///etc/passwd",
                    "https://localhost/vid.mp4", "https://127.0.0.1/vid.mp4",
                    "https://user:pass@youtube.com/watch?v=a",
                    "https://youtube.com:8080/test", "https://bad-site.com/post"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    validate_url(url)

    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("8.8.8.8",443))])
    def test_public_links(self, _):
        self.assertEqual(validate_url("https://youtu.be/XD-6LDZzXJ0"),
                         "https://youtu.be/XD-6LDZzXJ0")
        self.assertEqual(validate_url("https://remotion.media/video-30s.mp4"),
                         "https://remotion.media/video-30s.mp4")

    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("192.168.0.1",443))])
    def test_dns_private(self, _):
        with self.assertRaises(ValueError):
            validate_url("https://my-videos.com/foo.mp4")

class TestHighlights(unittest.TestCase):
    def setUp(self):
        self.segs = [
            Segment(0, 6, "Let me show why this happened"),
            Segment(12, 18, "But the secret is that voice actor"),
            Segment(21, 25, "The real voice reveal dekho"),
            Segment(38, 44, "You would never believe how"),
            Segment(63, 70, "Ek aisa raaz, asli sach"),
            Segment(83, 96, "This surprising moment is the reveal"),
        ]
        self.scenes = [4, 12, 19, 38, 62, 86]

    def test_non_overlapping(self):
        cuts = pick_clips(self.segs, self.scenes, 120, requested=4)
        self.assertTrue(1 <= len(cuts) <= 4)
        for i, cut in enumerate(cuts):
            self.assertTrue(15 <= cut.end-cut.start <= 60)
            self.assertGreaterEqual(cut.start, 0)
            self.assertLessEqual(cut.end, 120)
            for prev in cuts[:i]:
                self.assertFalse(cut.start < prev.end and cut.end > prev.start)

    def test_visual_fallback(self):
        cuts = pick_clips([], [], 75, requested=3)
        self.assertGreater(len(cuts), 0)
        self.assertEqual(cuts[0].reason, "timed fallback")

    def test_constraints(self):
        with self.assertRaises(ValueError):
            pick_clips(self.segs, [], 60, requested=11)
        with self.assertRaises(ValueError):
            pick_clips(self.segs, [], 60, requested=2, min_seconds=12)

    def test_30_second_video_yields_two_15_second_cuts(self):
        result = pick_clips([], [], 30.067, requested=3, min_seconds=15, max_seconds=15)
        self.assertEqual(len(result), 2)
        self.assertEqual([(x.start, x.end) for x in result], [(0,15),(15,30)])

    def test_srt_stamp(self):
        self.assertEqual(stamp(61.25), "00:01:01,250")

if __name__ == "__main__":
    unittest.main()
