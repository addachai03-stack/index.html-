"""CutNova optional subject-aware 9:16 crop.

Find faces at a few source-video timestamps; pick a stable horizontal
reframe for each Short, or fall back to centered crop. This is *not*
continuous face tracking. Can be disabled via --crop center.

OpenCV is an optional dependency. Never block MP4 export if face analysis fails.
"""
from __future__ import annotations

import math
import statistics
from pathlib import Path

CROP_MODES = ("auto", "center")


def normalize_crop_mode(mode: str) -> str:
    value = (mode or "auto").strip().lower()
    if value not in CROP_MODES:
        raise ValueError("Crop mode must be auto or center.")
    return value


def crop_offset(width: int, height: int, center_fraction: float = 0.5,
                out_w: int = 720, out_h: int = 1280) -> int:
    """Horizontal x of a 720x1280 crop in FFmpeg's scaled source coordinates.

    Input is proportionally scaled to cover the output (no letterboxing).
    Even alignment prevents 4:2:0 color subsampling from shifting pixels.
    """
    if width <= 0 or height <= 0 or out_w <= 0 or out_h <= 0:
        raise ValueError("Dimensions must be positive.")
    scale = max(out_w / width, out_h / height)
    sw = max(out_w, int(math.ceil(width * scale)))
    available = sw - out_w
    if available <= 0:
        return 0
    fraction = max(0, min(1, float(center_fraction)))
    desired = fraction * sw - out_w / 2
    x = max(0, min(available, round(desired)))
    return max(0, min(available, int(round(x / 2) * 2)))


def detect_face_center(source: Path, start: float, end: float) -> tuple[float | None, int]:
    """Sample up to five frames; return median horizontal face center.

    Uses OpenCV's bundled, general-purpose frontal-face cascade. It can
    miss angled faces, back views, motion blur, and cartoons. Falls back
    transparently when the classifier or decoder is unavailable.
    """
    try:
        import cv2
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        if cascade.empty():
            return None, 0
        video = cv2.VideoCapture(str(source))
        if not video.isOpened():
            return None, 0
        fractions = (0.12, 0.30, 0.5, 0.70, 0.88)
        centers = []
        try:
            for portion in fractions:
                time_sec = start + max(0, end - start) * portion
                video.set(cv2.CAP_PROP_POS_MSEC, time_sec * 1000)
                ok, frame = video.read()
                if not ok or frame is None:
                    continue
                h, w = frame.shape[:2]
                if w < 8 or h < 8:
                    continue
                max_width = 320
                if w > max_width:
                    new_h = max(1, round(h * max_width / w))
                    frame = cv2.resize(frame, (max_width, new_h))
                    h, w = frame.shape[:2]
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = cascade.detectMultiScale(gray, scaleFactor=1.08,
                                                 minNeighbors=4,
                                                 minSize=(max(20, w // 15), max(20, h // 15)))
                if len(faces):
                    x, _y, face_w, _face_h = max(faces, key=lambda f: f[2] * f[3])
                    centers.append(float(x + face_w / 2) / w)
        finally:
            video.release()
        if len(centers) < 2:
            return None, len(centers)
        return statistics.median(centers), len(centers)
    except Exception as exc:
        print("Face-aware crop unavailable; using center:", str(exc)[:150], flush=True)
        return None, 0


def compute_crop(source: Path, width: int, height: int,
                 start: float, end: float, mode: str = "auto") -> dict:
    """Return crop x and audit metadata, never invent a face location."""
    mode = normalize_crop_mode(mode)
    frac = 0.5
    detected = 0
    method = "center"
    if mode == "auto" and width / height > 720 / 1280:
        center, detected = detect_face_center(source, start, end)
        if center is not None:
            frac = center
            method = "face-aware-static"
    x = crop_offset(width, height, frac)
    return {
        "mode": mode,
        "method": method,
        "crop_x": x,
        "center_fraction": round(frac, 4),
        "face_frames": detected,
        "note": "Static per-clip reframe; not continuous subject tracking"
    }
