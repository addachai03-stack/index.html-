"""GitHub-only controlled test of Hindi speech -> ASR -> actual MP4 subtitles.

The audio is synthesized from original Hindi text with espeak-ng. This is NOT
a human-speaker accuracy benchmark and proves neither natural Hindi accuracy
nor current social-video downloadability.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path

from studio import Candidate, captions_for, render, transcribe, video_dimensions
from smartcrop import compute_crop
from speech_smoke import compare_hindi_raster, verify_video


def main() -> None:
    source = Path("hindi_source.mp4").resolve()
    if not source.exists():
        raise FileNotFoundError("Generate hindi_source.mp4 via GitHub workflow first.")
    out = Path("output").resolve()
    out.mkdir(exist_ok=True)
    work = out / "_hindi_work"
    work.mkdir(exist_ok=True)
    source_type = os.environ.get("CUTNOVA_TEST_SOURCE", "synthetic espeak-ng Hindi speech")
    report = {"source_type": source_type,
              "natural_speech_test": source_type.startswith("licensed human speech"),
              "status": "started"}
    try:
        speech, meta = transcribe(source, work, language="hi")
        full_text = " ".join(s.text for s in speech)
        script_chars = re.findall(r"[\u0900-\u097F]", full_text)
        report.update({
            "asr": meta, "transcript": full_text[:1500],
            "recognized_segments": len(speech),
            "devanagari_codepoints_recognized": len(script_chars),
        })
        if not speech:
            raise RuntimeError("Hindi Whisper returned no recognized words.")
        if len(script_chars) < 8:
            raise RuntimeError(
                "Hindi ASR did not yield sufficient Devanagari text; cannot verify captions."
            )
        clip = Candidate(0, 15, 0.8, "Hindi synthetic clip", full_text, "Hindi ASR check")
        sub = out / "hindi_asr_recognized.srt"
        if not captions_for(clip, speech, sub):
            raise RuntimeError("No SRT generated from recognized Hindi words.")
        width, height = video_dimensions(source)
        crop = compute_crop(source, width, height, 0, 15, "center")
        captioned = out / "hindi_asr_captioned_short.mp4"
        clean = out / "hindi_unsubtitled_reference.mp4"
        render(source, captioned, clip, sub, crop["crop_x"])
        render(source, clean, clip, None, crop["crop_x"])
        sample_points = (2.0, 5.0, 8.0, 11.5)
        pixel_deltas = [compare_hindi_raster(clean, captioned, work, at_time=t)
                        for t in sample_points]
        pixel_difference = max(pixel_deltas)
        report["caption_sample_times_seconds"] = list(sample_points)
        report["caption_pixel_deltas"] = [round(x, 3) for x in pixel_deltas]
        report["caption_pixel_delta"] = round(pixel_difference, 3)
        report["video"] = verify_video(captioned)
        report["status"] = "completed" if pixel_difference > 0.5 else "failed"
        if pixel_difference <= 0.5:
            raise RuntimeError("Hindi subtitles were not visually confirmed in rendered MP4.")
        print("HINDI_ASR_SYNTHETIC_SUCCESS", json.dumps(report, ensure_ascii=False))
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = str(exc)
        raise
    finally:
        (out / "hindi_asr_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
