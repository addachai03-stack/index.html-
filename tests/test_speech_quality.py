import unittest
from types import SimpleNamespace
from speech_quality import normalize_language, whisper_settings, group_word_timings, has_audible_speech_candidate
from studio import Segment, Candidate, captions_for
from pathlib import Path
import tempfile
import wave
import struct


def word(start, end, text):
    return SimpleNamespace(start=start, end=end, word=text)


class TestSpeechLanguage(unittest.TestCase):
    def test_allowed_and_rejected(self):
        self.assertEqual(normalize_language(None), "auto")
        self.assertEqual(normalize_language(" HI "), "hi")
        self.assertEqual(normalize_language("en"), "en")
        with self.assertRaises(ValueError):
            normalize_language("hindi; echo secret")

    def test_model_for_hindi(self):
        self.assertEqual(whisper_settings("hi"), ("small", "hi"))
        self.assertEqual(whisper_settings("en"), ("tiny", "en"))
        self.assertEqual(whisper_settings("auto"), ("tiny", None))


class TestAudibleRetrySafety(unittest.TestCase):
    def test_silent_clip_is_not_retried(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "silent.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(bytes(32000))
            self.assertFalse(has_audible_speech_candidate(path))

    def test_audible_clip_can_be_retried(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "audible.wav"
            samples = b"".join(struct.pack("<h", 5000 if i % 2 else -5000)
                               for i in range(16000))
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(samples)
            self.assertTrue(has_audible_speech_candidate(path))

    def test_invalid_wave_is_not_retried(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "bad.wav"
            path.write_bytes(b"not wave")
            self.assertFalse(has_audible_speech_candidate(path))


class TestWhisperWordTimings(unittest.TestCase):
    def test_phrase_boundaries_no_word_loss(self):
        words = [
            word(0.4, 0.7, "नमस्ते"),
            word(0.72, 1.1, "दोस्तों"),
            word(1.13, 1.35, "यह"),
            word(1.40, 1.7, "वीडियो"),
            word(2.9, 3.2, "English"),
            word(3.22, 3.5, "shorts"),
        ]
        pieces = group_word_timings(words, max_chars=25)
        self.assertEqual(" ".join(p[2] for p in pieces),
                         "नमस्ते दोस्तों यह वीडियो English shorts")
        self.assertGreaterEqual(len(pieces), 2)
        self.assertEqual(pieces[0][0], 0.4)
        self.assertEqual(pieces[-1][1], 3.5)

    def test_incorrect_word_times_do_not_crash(self):
        parts = group_word_timings([
            word(-2, 1, "bad"), word(0, 0, "zero"),
            word(0.5, 0.9, "works")
        ])
        self.assertEqual(parts, [(0.5, 0.9, "works")])

    def test_phrase_timing_survives_to_srt(self):
        words = [
            word(3.5, 4.0, "This"), word(4.01, 4.4, "works"),
            word(6.2, 6.6, "नमस्ते"), word(6.62, 7.0, "दोस्तों")
        ]
        phrases = group_word_timings(words, max_chars=32)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "test.srt"
            segments = [Segment(a, b, c) for a, b, c in phrases]
            clip = Candidate(3, 13, 0.5, "test", "", "synthetic")
            self.assertTrue(captions_for(clip, segments, path))
            value = path.read_text(encoding="utf-8")
            self.assertIn("00:00:00,500 --> 00:00:01,400", value)
            self.assertIn("00:00:03,200 --> 00:00:04,000", value)
            self.assertIn("नमस्ते दोस्तों", value)


if __name__ == "__main__":
    unittest.main()
