#!/usr/bin/env python3
"""CutNova URL-to-Shorts engine. Authorized public videos only."""
from __future__ import annotations
import argparse
import ipaddress
import json
import math
import re
import shutil
import socket
import subprocess
import sys
import traceback
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile, ZIP_DEFLATED
from premium import highlight_bonus, normalize_style, distribute_subtitles, create_creator_pack

ALLOWED_HOSTS = ("youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.watch",
                 "tiktok.com", "vimeo.com", "dailymotion.com", "dai.ly",
                 "twitter.com", "x.com", "archive.org", "remotion.media",
                 "storage.googleapis.com", "cdn.pixabay.com")
HOOK_WORDS = ("secret", "reveal", "shocking", "surprise", "truth", "real voice",
              "actually", "wait", "watch", "why", "how", "listen", "amazing",
              "first", "crazy", "finally", "pata", "kaise", "kyun", "kya", "asli",
              "sach", "dekho", "raaz", "lekin", "असली", "सच", "लेकिन", "कौन",
              "क्या", "कैसे", "क्यों", "देखो", "आवाज़", "राज़")

@dataclass
class Segment:
    start: float
    end: float
    text: str

@dataclass
class Candidate:
    start: float
    end: float
    score: float
    hook: str
    transcript: str
    reason: str

def validate_url(url: str) -> str:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Only public HTTPS video URLs are allowed.")
    if parsed.username or parsed.password or parsed.port:
        raise ValueError("Credentials and custom ports are unsupported.")
    host = parsed.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Local/private hosts are forbidden.")
    try:
        ipaddress.ip_address(host)
        raise ValueError("IP-address video links are not supported.")
    except ValueError as exc:
        if "not supported" in str(exc):
            raise
    known = any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)
    direct = bool(re.search(r"\.(mp4|mov|m4v|webm)$", parsed.path, flags=re.I))
    if not known and not direct:
        raise ValueError("Use supported social video pages or a direct HTTPS MP4/MOV/WebM.")
    try:
        results = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("Video host cannot be resolved.") from exc
    if not results or any(not ipaddress.ip_address(x[4][0]).is_global for x in results):
        raise ValueError("Non-public IP address blocked.")
    # DNS rebinds/redirects remain theoretically possible. This owner-only workflow
    # should not be exposed as a general-purpose public web endpoint.
    return url

def run(args, timeout=600, check=True, cwd=None):
    proc = subprocess.run(args, text=True, capture_output=True, timeout=timeout, cwd=cwd)
    if check and proc.returncode:
        raise RuntimeError(args[0] + " failed: " + (proc.stderr or proc.stdout)[-1800:])
    return proc

def download(url: str, work: Path) -> Path:
    from yt_dlp import YoutubeDL
    opts = {
        "format": "bv*[height<=720]+ba/b[height<=720]/best",
        "merge_output_format": "mp4",
        "outtmpl": str(work / "source.%(ext)s"),
        "noplaylist": True, "restrictfilenames": True,
        "max_filesize": 650 * 1024 * 1024,
        "socket_timeout": 25, "retries": 2, "fragment_retries": 2,
        "no_warnings": True, "quiet": False, "ignoreerrors": False,
    }
    print("Downloading authorized public video (no login/DRM bypass).", flush=True)
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not info:
            raise RuntimeError("Platform did not return public video.")
    files = sorted((p for p in work.glob("source.*") if p.suffix.lower()
                    in {".mp4", ".mkv", ".mov", ".m4v", ".webm"}),
                   key=lambda f: f.stat().st_size, reverse=True)
    if not files:
        raise RuntimeError("No downloadable video. Source may restrict automated access.")
    if files[0].stat().st_size > 650 * 1024 * 1024:
        raise ValueError("Source exceeds 650 MB.")
    return files[0]

def probe(source: Path) -> float:
    proc = run(["ffprobe", "-v", "error", "-show_entries",
                "format=duration:stream=codec_type", "-of", "json", str(source)], timeout=30)
    info = json.loads(proc.stdout)
    duration = float(info.get("format", {}).get("duration", 0))
    if not (15 <= duration <= 7200):
        raise ValueError("Source duration must be between 15 seconds and 2 hours.")
    if not any(s.get("codec_type") == "video" for s in info.get("streams", [])):
        raise ValueError("Video stream missing.")
    return duration

def transcribe(source: Path, work: Path) -> tuple[list[Segment], str]:
    wav = work / "audio.wav"
    proc = run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=180, check=False)
    if proc.returncode or not wav.exists():
        return [], "No audio track / ASR unavailable"
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        pieces, meta = model.transcribe(str(wav), vad_filter=True, beam_size=2)
        segments = [Segment(round(float(s.start), 2), round(float(s.end), 2), s.text.strip())
                    for s in pieces if s.text and s.text.strip()]
        return segments, "Whisper tiny; language " + meta.language
    except Exception as error:
        print("Whisper fallback:", str(error)[:250], flush=True)
        return [], "ASR unavailable; visual-only analysis"

def detect_scenes(source: Path) -> list[float]:
    # Low-res 1 fps histogram difference reduces work for long uploads.
    try:
        proc = run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(source),
                    "-vf", r"fps=1,scale=160:-2,select=gt(scene\,0.24),showinfo",
                    "-an", "-f", "null", "-"], timeout=250, check=False)
        return [float(t) for t in re.findall(r"pts_time:([0-9.]+)", proc.stderr)][:800]
    except (subprocess.TimeoutExpired, RuntimeError):
        return []

def score_window(segments: list[Segment], scenes: list[float],
                 start: float, end: float, style: str = "engagement") -> Candidate:
    relevant = [s for s in segments if s.end > start and s.start < end]
    text = " ".join(s.text for s in relevant)
    density = min(1.0, len(re.findall(r"\w+", text)) / max(1, (end-start)*2.25))
    coverage = min(1.0, sum(max(0, min(end, s.end)-max(start, s.start))
                            for s in relevant) / max(1, end-start))
    cues = min(1.0, sum(w in text.lower() for w in HOOK_WORDS)/3)
    motion = min(1.0, sum(start <= sc < end for sc in scenes) / max(1, (end-start)/9))
    score = 0.31*density + 0.30*coverage + 0.19*cues + 0.20*motion
    score += highlight_bonus(text, style)
    if relevant and abs(relevant[0].start - start) <= 3:
        score += 0.05
    if not relevant and not scenes:
        score = 0.12
    hook = re.sub(r"\s+", " ", text).strip()[:85]
    if len(hook) == 85:
        hook = hook.rsplit(" ", 1)[0]
    return Candidate(round(start, 2), round(end, 2), round(score, 4),
                     hook or "Scene highlight", text,
                     "speech, hooks and scenes" if segments else
                     ("scene changes" if scenes else "timed fallback"))

def pick_clips(segments: list[Segment], scenes: list[float], duration: float,
               requested: int = 6, min_seconds: int = 15, max_seconds: int = 60,
               style: str = "engagement") -> list[Candidate]:
    normalize_style(style)
    if not (1 <= requested <= 10):
        raise ValueError("Clips count must be 1-10.")
    if not (15 <= min_seconds <= max_seconds <= 60):
        raise ValueError("Clip lengths must be 15-60 sec.")
    lens = sorted({min_seconds, max_seconds, 20, 30, 45}.intersection(
        range(min_seconds, max_seconds+1)))
    starts = sorted(
        {float(s) for s in range(0, max(1, math.floor(duration - min_seconds) + 1), 8)}
        | {float(i * min_seconds) for i in range(max(1, int(duration // min_seconds)))}
        | {round(max(0, duration - min_seconds), 2)}
    )
    windows = [
        score_window(segments, scenes, float(start), float(start + length), style)
        for start in starts
        for length in lens if start + length <= duration + 0.001
    ]
    if not windows:
        windows = [score_window(segments, scenes, 0, min(duration, max_seconds), style)]
    selected = []
    for cut in sorted(windows, key=lambda c: (-c.score, c.start)):
        if any(cut.start < prev.end and cut.end > prev.start for prev in selected):
            continue
        selected.append(cut)
        if len(selected) >= requested:
            break
    # A greedy top-scoring 30s window can block two 15s clips.
    # When user requested more clips and the source can fit more, use
    # evenly spaced non-overlapping 15s candidates rather than silently under-fill.
    capacity = min(requested, int(duration // min_seconds))
    if len(selected) < capacity:
        spaced = [
            score_window(segments, scenes, float(i * min_seconds),
                         float((i + 1) * min_seconds), style)
            for i in range(capacity)
        ]
        if len(spaced) > len(selected):
            selected = spaced
    return sorted(selected, key=lambda c: c.start)

def stamp(sec: float) -> str:
    ms = int(round(max(0, sec)*1000))
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

def captions_for(cut: Candidate, segments: list[Segment], target: Path) -> bool:
    """Readable short subtitles that keep all recognized words.

    Word timings inside each ASR segment are approximations; review them.
    """
    lines = []
    for seg in segments:
        for s, e, text in distribute_subtitles(
            seg.start, seg.end, seg.text, cut.start, cut.end, max_chars=40
        ):
            if e > s:
                lines.append(f"{len(lines)+1}\n{stamp(s)} --> {stamp(e)}\n{text}\n")
    if not lines:
        return False
    target.write_text("\n".join(lines), encoding="utf-8")
    return True

def render(source: Path, target: Path, cut: Candidate, sub: Path | None):
    # 9:16 center crop, H.264/AAC, optional spoken-word captions burned in.
    vf = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1"
    if sub:
        vf += ",subtitles=" + sub.name + (
            ":force_style='FontName=Noto Sans,FontSize=19,Bold=1,Outline=3,"
            "Shadow=0,MarginV=155,Alignment=2'")
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
           "-ss", str(cut.start), "-i", str(source), "-t", str(cut.end-cut.start),
           "-map", "0:v:0", "-map", "0:a:0?", "-vf", vf,
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
           "-pix_fmt", "yuv420p", "-r", "25",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
           str(target)]
    run(cmd, timeout=700, cwd=target.parent)
    if not target.exists() or target.stat().st_size < 4096:
        raise RuntimeError("No valid MP4 exported.")

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--clips", type=int, default=6)
    p.add_argument("--min-seconds", type=int, default=15)
    p.add_argument("--max-seconds", type=int, default=60)
    p.add_argument("--style", choices=["engagement","funny","facts","story"], default="engagement")
    p.add_argument("--rights-confirmed", action="store_true")
    p.add_argument("--output", default="output")
    a = p.parse_args()
    output = Path(a.output).resolve()
    output.mkdir(exist_ok=True, parents=True)
    work = output / "_work"
    work.mkdir(exist_ok=True)
    report = {"status": "started", "source_url": a.url,
              "disclaimer": "Scores are heuristic, not guaranteed viral results."}
    try:
        if not a.rights_confirmed:
            raise ValueError("Confirm you own or have rights to edit this video.")
        url = validate_url(a.url)
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            raise RuntimeError("FFmpeg/FFprobe missing.")
        if not (1 <= a.clips <= 10 and 15 <= a.min_seconds <= a.max_seconds <= 60):
            raise ValueError("Choose 1-10 clips and lengths from 15-60 sec.")
        video = download(url, work)
        duration = probe(video)
        print("Decoded length:", duration, flush=True)
        scenes = detect_scenes(video)
        speech, asr = transcribe(video, work)
        choices = pick_clips(speech, scenes, duration, a.clips, a.min_seconds, a.max_seconds, a.style)
        manifest = {"source": url, "duration": duration, "asr": asr, "scenes": len(scenes),
                    "style": a.style,
                    "note": "AI-assisted cues, not a guarantee of views or shares.",
                    "clips": []}
        for i, cut in enumerate(choices, 1):
            base = f"short_{i:02}"
            sub = output / (base + ".srt")
            has_captions = captions_for(cut, speech, sub)
            target = output / (base + ".mp4")
            print(f"Rendering Short #{i}: {cut.start}s -> {cut.end}s", flush=True)
            render(video, target, cut, sub if has_captions else None)
            item = asdict(cut)
            item["mp4"] = target.name
            item["captions"] = sub.name if has_captions else None
            manifest["clips"].append(item)
        create_creator_pack(choices, output, a.style, url)
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                              encoding="utf-8")
        archive = output / "CutNova_Shorts.zip"
        with ZipFile(archive, "w", ZIP_DEFLATED) as z:
            for item in sorted(output.iterdir()):
                if item.is_file() and item != archive:
                    z.write(item, item.name)
        report.update(status="completed", count=len(choices),
                      videos=[c["mp4"] for c in manifest["clips"]])
        print("Created", archive, flush=True)
        return 0
    except Exception as error:
        report.update(status="failed", error=str(error),
                      recovery="Try a public HTTPS direct MP4 you own. Platform download restrictions cannot be bypassed.")
        print("CUTNOVA ERROR:", error, file=sys.stderr)
        traceback.print_exc(limit=2)
        return 1
    finally:
        (output / "report.json").write_text(json.dumps(report, indent=2,
                                         ensure_ascii=False), encoding="utf-8")
        shutil.rmtree(work, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
