"""CutNova controlled end-to-end speech/subtitle/render smoke test.

Source speech and visuals are synthetically created by ffmpeg + espeak-ng
inside GitHub Actions. This proves the ASR -> SRT -> burned MP4 plumbing.
A separate explicitly labeled Hindi SRT render checks Devanagari font support;
it is NOT a claim that Hindi ASR recognized those manually supplied lines.
"""
from __future__ import annotations

import json
from pathlib import Path

from smartcrop import compute_crop
from studio import Candidate, captions_for, render, run, transcribe, video_dimensions


def verify_video(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,width,height,codec_name", "-of",
             "json", str(path)], timeout=30)
    info = json.loads(p.stdout)
    stream = next((s for s in info["streams"] if s.get("codec_type") == "video"), {})
    if int(stream.get("width", 0)) != 720 or int(stream.get("height", 0)) != 1280:
        raise RuntimeError("Rendered video not 720x1280.")
    duration = float(info["format"]["duration"])
    if not (14.7 < duration < 15.4):
        raise RuntimeError("Rendered video duration was not ~15 seconds.")
    return {"duration": duration, "codec": stream.get("codec_name"),
            "width": stream.get("width"), "height": stream.get("height")}


def compare_hindi_raster(source: Path, with_hindi: Path, temp: Path) -> float:
    """Check text changed the lower safe caption region at matched timestamps."""
    try:
        import cv2
        import numpy as np
        a = temp / "no_text.png"
        b = temp / "with_hindi.png"
        for video, image in ((source, a), (with_hindi, b)):
            run(["ffmpeg", "-nostdin", "-v", "error", "-y",
                 "-ss", "2", "-i", str(video), "-frames:v", "1", str(image)], timeout=60)
        x = cv2.imread(str(a))
        y = cv2.imread(str(b))
        if x is None or y is None:
            return 0.0
        delta = cv2.absdiff(x[910:1250, 80:640], y[910:1250, 80:640])
        return float(np.mean(delta))
    except Exception as exc:
        print("Raster subtitle comparison failed:", str(exc)[:250])
        return 0.0


def main():
    output = Path("output").resolve()
    output.mkdir(exist_ok=True)
    source = Path("speech_source.mp4").resolve()
    if not source.exists():
        raise FileNotFoundError("GitHub Action must create synthetic spoken video.")
    duration = 15
    width, height = video_dimensions(source)
    cut = Candidate(0, duration, 0.8, "synthetic speech",
                    "", "generated speech smoke")

    work = output / "_speech_work"
    work.mkdir(exist_ok=True)
    speech, asr_info = transcribe(source, work)
    print("Whisper ASR:", asr_info)
    print("Recognized speech chunks:", len(speech))
    print("Speech sample:", [s.text[:120] for s in speech[:4]])
    if not speech or not any(x.text.strip() for x in speech):
        raise RuntimeError("Speech-to-text returned no usable words; cannot claim ASR success.")
    srt = output / "speech_recognized.srt"
    if not captions_for(cut, speech, srt):
        raise RuntimeError("Speech detected but no SRT subtitles were exported.")
    if "-->" not in srt.read_text(encoding="utf-8"):
        raise RuntimeError("Exported SRT has no valid timestamp markers.")

    crop = compute_crop(source, width, height, 0, duration, "auto")
    video = output / "speech_caption_short.mp4"
    render(source, video, cut, srt, crop["crop_x"])

    # A reference without captions, used only to confirm pixels change.
    clean = output / "reference_no_captions.mp4"
    render(source, clean, cut, None, crop["crop_x"])

    # This is an explicit synthetic Hindi font test, not speech transcription.
    manual_hi = output / "synthetic_devanagari_font_test.srt"
    manual_hi.write_text(
        "1\n00:00:00,000 --> 00:00:05,000\nनमस्ते दोस्तों, यह कटनोवा है।\n\n"
        "2\n00:00:05,000 --> 00:00:10,000\nइस वीडियो का परीक्षण चल रहा है।\n",
        encoding="utf-8"
    )
    hindi = output / "devanagari_font_test.mp4"
    render(source, hindi, cut, manual_hi, crop["crop_x"])

    asr_pixel_delta = compare_hindi_raster(clean, video, work)
    hindi_pixel_delta = compare_hindi_raster(clean, hindi, work)
    # Small values indicate missing subtitle rendering. Text should cause
    # a large, obvious pixel difference compared with the clean reference.
    if asr_pixel_delta < 0.5:
        raise RuntimeError("Burned automatic speech subtitles not visually detected.")
    if hindi_pixel_delta < 0.5:
        raise RuntimeError("Burned Devanagari font sample not visually detected.")

    report = {
        "speech_source": "synthetic espeak-ng English/Hinglish-like spoken clip, generated in workflow",
        "asr": asr_info,
        "recognized_segments": len(speech),
        "recognized_transcript_excerpt": " ".join(s.text for s in speech)[:500],
        "srt_from_asr": True,
        "asr_caption_pixel_delta": round(asr_pixel_delta, 3),
        "manual_devanagari_caption_pixel_delta": round(hindi_pixel_delta, 3),
        "hindi_font_test_is_not_hindi_asr": True,
        "framing": crop,
        "output": verify_video(video),
    }
    (output / "speech_smoke_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("SPEECH_SMOKE_SUCCESS", json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
