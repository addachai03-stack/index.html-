import unittest
from pathlib import Path
from unittest.mock import patch

from smartcrop import crop_offset, compute_crop, normalize_crop_mode


class TestCropGeometry(unittest.TestCase):
    def test_landscape_center_crop_around_midpoint(self):
        x = crop_offset(1920, 1080, 0.5)
        self.assertGreater(x, 0)
        self.assertEqual(x % 2, 0)
        self.assertLess(x, crop_offset(1920, 1080, 1.0))

    def test_face_left_shifts_framing_left(self):
        left = crop_offset(1920, 1080, 0.17)
        center = crop_offset(1920, 1080, 0.5)
        right = crop_offset(1920, 1080, 0.83)
        self.assertLess(left, center)
        self.assertLess(center, right)

    def test_portrait_no_horizontal_crop(self):
        self.assertEqual(crop_offset(720, 1280, 0.9), 0)
        self.assertEqual(crop_offset(1080, 1920, 0.1), 0)

    def test_extreme_outside_values_clamped(self):
        self.assertEqual(crop_offset(1920, 1080, -1), 0)
        self.assertEqual(crop_offset(1920, 1080, -1), crop_offset(1920, 1080, 0))
        self.assertEqual(crop_offset(1920, 1080, 10), crop_offset(1920, 1080, 1))

    def test_dimensions_must_be_valid(self):
        with self.assertRaises(ValueError):
            crop_offset(0, 1080)
        with self.assertRaises(ValueError):
            crop_offset(1920, -1)

    def test_bad_crop_mode(self):
        with self.assertRaises(ValueError):
            normalize_crop_mode("auto-track-all-people")


class TestSmartFaceFallback(unittest.TestCase):
    @patch("smartcrop.detect_face_center", return_value=(0.22, 3))
    def test_detected_face_used(self, _):
        out = compute_crop(Path("/not/needed.mp4"), 1920, 1080, 0, 30)
        self.assertEqual(out["method"], "face-aware-static")
        self.assertEqual(out["face_frames"], 3)
        self.assertLess(out["crop_x"], crop_offset(1920, 1080, 0.5))

    @patch("smartcrop.detect_face_center", return_value=(None, 0))
    def test_no_face_center_fallback(self, _):
        out = compute_crop(Path("/not/needed.mp4"), 1920, 1080, 0, 30)
        self.assertEqual(out["method"], "center")
        self.assertEqual(out["center_fraction"], 0.5)

    @patch("smartcrop.detect_face_center")
    def test_center_mode_skips_detection(self, detection):
        out = compute_crop(Path("/not/needed.mp4"), 1920, 1080, 0, 30, "center")
        detection.assert_not_called()
        self.assertEqual(out["method"], "center")

    @patch("smartcrop.detect_face_center")
    def test_vertical_source_skips_detection(self, detection):
        out = compute_crop(Path("/not/needed.mp4"), 720, 1280, 0, 30, "auto")
        detection.assert_not_called()
        self.assertEqual(out["crop_x"], 0)


if __name__ == "__main__":
    unittest.main()
