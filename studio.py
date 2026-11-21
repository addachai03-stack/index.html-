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
from tracking_crop import crop_filter
from hook_rank import tokens, hook_strength, opening_strength, speech_coverage, strongest_phrase, best_nonoverlap
from pacing import normalize_pacing, detect_silences, keep_intervals, remap_speech, trim_media
from smartcrop import compute_crop, normalize_crop_mode
from speech_quality import normalize_language, whisper_settings, group_word_timings, has_audible_speech_candidate
from roman_captions import caption_text
from caption_styles import subtitle_style
from animated_captions import write_animated
from github_media import is_github_attachment_url, download_github_attachment

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
    words: tuple = ()

@dataclass
class Candidate:
    start: float
    end: float
    score: float
    hook: str
    transcript: str
    reason: str

def validate_url(url: str) -> str:
    if not isinstance(url,str) or len(url)>2048 or any(ord(c)<32 or ord(c)==127 for c in url):
        raise ValueError("Invalid URL or control characters.")
    url = url.strip()
    from urllib.parse import parse_qsl
    parsed = urlparse(url)
    if parsed.fragment or "\\" in url or any(k.lower() in {"token","access_token","auth","authorization","password","key","api_key","signature","sig","credential","expires"} or k.lower().startswith(("x-amz-","x-goog-")) for k,v in parse_qsl(parsed.query)):
        raise ValueError("Private or signed URLs are not safe in a public repository.")
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
    known = known or is_github_attachment_url(url)
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
    if is_github_attachment_url(url):
        return download_github_attachment(url, work)
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

def probe(source: Path, minimum: float = 15) -> float:
    proc = run(["ffprobe", "-v", "error", "-show_entries",
                "format=duration:stream=codec_type", "-of", "json", str(source)], timeout=30)
    info = json.loads(proc.stdout)
    duration = float(info.get("format", {}).get("duration", 0))
    if not (minimum <= duration <= 7200):
        raise ValueError("Source duration must be between 15 seconds and 2 hours.")
    if not any(s.get("codec_type") == "video" for s in info.get("streams", [])):
        raise ValueError("Video stream missing.")
    return duration

def video_dimensions(source: Path) -> tuple[int, int]:
    """Read true video stream dimensions from ffprobe for smart reframe."""
    proc = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "json",
                str(source)], timeout=30)
    streams = json.loads(proc.stdout).get("streams", [])
    if not streams:
        raise ValueError("Video stream dimensions missing.")
    width = int(streams[0].get("width", 0))
    height = int(streams[0].get("height", 0))
    if width <= 0 or height <= 0:
        raise ValueError("Invalid video dimensions.")
    return width, height

def transcribe(source: Path, work: Path, language: str = "auto") -> tuple[list[Segment], str]:
    """Run multilingual Whisper ASR with word timestamps and a safe Hindi retry.

    If Hindi speech is filtered out by VAD, retry without VAD only when the
    extracted audio is audibly non-silent. Text must originate from the ASR.
    """
    choice = normalize_language(language)
    wav = work / "audio.wav"
    proc = run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=180, check=False)
    if proc.returncode or not wav.exists():
        return [], "No audio track / ASR unavailable"
    try:
        from faster_whisper import WhisperModel
        model_name, hint = whisper_settings(choice)
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        kwargs = {"vad_filter": True, "beam_size": 2, "word_timestamps": True}
        if hint is not None:
            kwargs["language"] = hint
        if choice == "hi":
            # Script guidance only; not a transcript. ASR still derives all
            # words from the audio, and output is verified before claiming Hindi.
            kwargs["initial_prompt"] = (
                "यह हिन्दी भाषा की आवाज़ है। हिन्दी प्रतिलेखन देवनागरी लिपि में लिखें।"
            )

        def collect(parts) -> tuple[list[Segment], int]:
            found: list[Segment] = []
            aligned_parts = 0
            for part in parts:
                word_groups = []
                timed = group_word_timings(getattr(part, "words", None) or [], word_groups=word_groups)
                if timed:
                    found.extend(Segment(start, stop, text, words) for (start, stop, text), words in zip(timed, word_groups))
                    aligned_parts += 1
                elif getattr(part, "text", "").strip():
                    found.append(Segment(round(float(part.start), 2),
                                         round(float(part.end), 2), part.text.strip()))
            return found, aligned_parts

        pieces, meta = model.transcribe(str(wav), **kwargs)
        segments, accurate_parts = collect(pieces)
        retry = ""
        if not segments and choice == "hi" and has_audible_speech_candidate(wav):
            # VAD sometimes rejects robotic or quiet Hindi speech.
            kwargs["vad_filter"] = False
            pieces, meta = model.transcribe(str(wav), **kwargs)
            segments, accurate_parts = collect(pieces)
            retry = "; VAD-off retry"
        description = ("Whisper " + model_name + "; requested " + choice +
                       "; detected " + str(getattr(meta, "language", "unknown")) +
                       "; word-aligned parts " + str(accurate_parts) + retry)
        return segments, description
    except Exception as error:
        print("Whisper speech unavailable:", str(error)[:350], flush=True)
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
    # Word-aligned ASR allows tighter source grounding at clip boundaries.
    excerpts = []
    for seg in relevant:
        if seg.words:
            phrase = " ".join(t for a,b,t in seg.words if b>start and a<end)
        else:
            phrase = seg.text
        if phrase:
            excerpts.append(phrase)
    text = " ".join(excerpts)
    density = min(1.,len(tokens(text))/max(1.,(end-start)*2.25))
    coverage = speech_coverage([(s.start,s.end) for s in relevant],start,end)
    opening = opening_strength(relevant,start,end)
    cues = hook_strength(text)
    motion = min(1.,sum(start<=sc<end for sc in scenes)/max(1.,(end-start)/9))
    score = .22*density+.23*coverage+.25*opening+.12*cues+.10*motion
    score += highlight_bonus(text,style)
    if relevant and abs(relevant[0].start-start)<=.6:
        score += .04
    if not relevant and not scenes:
        score = .12
    hook = strongest_phrase(text)
    reason = "speech, opening hooks and scenes" if relevant else ("scene changes" if scenes else "timed fallback")
    return Candidate(round(start,2),round(end,2),round(min(1.,score),4),
                     hook or "Scene highlight",text,reason)


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
        | {round(max(0., seg.start-.15),2) for seg in sorted(segments,key=lambda seg:(-hook_strength(seg.text),seg.start))[:500] if hook_strength(seg.text)>0 and seg.start<=duration-min_seconds}
    )
    windows = [
        score_window(segments, scenes, float(start), float(start + length), style)
        for start in starts
        for length in lens if start + length <= duration + 0.001
    ]
    if not windows:
        windows = [score_window(segments, scenes, 0, min(duration, max_seconds), style)]
    return best_nonoverlap(windows, requested)

def stamp(sec: float) -> str:
    ms = int(round(max(0, sec)*1000))
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

def captions_for(cut: Candidate, segments: list[Segment], target: Path, script: str = "original") -> bool:
    """Readable short subtitles that keep all recognized words.

    Word timings inside each ASR segment are approximations; review them.
    """
    lines = []
    for seg in segments:
        for s, e, text in distribute_subtitles(
            seg.start, seg.end, caption_text(seg.text, script), cut.start, cut.end, max_chars=32
        ):
            if e > s:
                lines.append(f"{len(lines)+1}\n{stamp(s)} --> {stamp(e)}\n{text}\n")
    if not lines:
        return False
    target.write_text("\n".join(lines), encoding="utf-8")
    return True

def render(source: Path, target: Path, cut: Candidate, sub: Path | None,
           crop_x: int | None = None, caption_style: str = "classic", crop_path=None):
    # 9:16 subject-aware *static* x crop; center fallback, no black bars.
    # crop_x is computed from video dimensions and must be a safe integer.
    crop_expr = crop_filter(crop_path) if crop_path else ("crop=720:1280" if crop_x is None else f"crop=720:1280:x=\'max(0,min(iw-ow,{int(crop_x)}))\':y=\'(ih-oh)/2\'")
    vf = "setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase," + crop_expr + ",setsar=1"
    if sub:
        vf += ",subtitles=" + sub.name
        if sub.suffix.lower() != ".ass":
            vf += ":force_style='" + subtitle_style(caption_style) + "'"
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
    p.add_argument("--crop", choices=["auto", "center", "track"], default="auto")
    p.add_argument("--language", choices=["auto", "hi", "en"], default="auto")
    p.add_argument("--caption-script", choices=["original", "roman"], default="original")
    p.add_argument("--caption-style", choices=["classic", "yellow", "boxed", "karaoke"], default="classic")
    p.add_argument("--pacing", choices=["original", "tight"], default="original")
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
        width, height = video_dimensions(video)
        normalize_crop_mode(a.crop)
        normalize_language(a.language)
        print("Decoded length:", duration, "size:", width, height, flush=True)
        scenes = detect_scenes(video)
        speech, asr = transcribe(video, work, a.language)
        choices = pick_clips(speech, scenes, duration, a.clips, a.min_seconds, a.max_seconds, a.style)
        manifest = {"source": url, "duration": duration, "asr": asr, "scenes": len(scenes),
                    "style": a.style,
                    "crop_mode": a.crop,
                    "speech_language": a.language,
                    "caption_script": a.caption_script,
                    "caption_style": a.caption_style,
                    "pacing": a.pacing,
                    "note": "AI-assisted cues, not a guarantee of views or shares.",
                    "clips": []}
        for i, cut in enumerate(choices, 1):
            base = f"short_{i:02}"
            render_source, render_cut, render_speech = video, cut, speech
            render_width, render_height = width, height
            duration_before = cut.end-cut.start
            kept = [(0.,duration_before)]
            pacing_note = "Original timing"
            if normalize_pacing(a.pacing) == "tight":
                try:
                    protected = [(max(0.,s.start-cut.start),min(duration_before,s.end-cut.start)) for s in speech if s.end>cut.start and s.start<cut.end]
                    if protected:
                        plan = keep_intervals(duration_before, detect_silences(video,cut.start,cut.end),protected,a.min_seconds)
                        shortened = sum(b-a for a,b in plan)
                        if shortened < duration_before-.39:
                            trimmed = work / (base + "_tight.mp4")
                            trim_media(video,trimmed,plan,cut.start)
                            # Verify decoded media before adopting the edited timeline.
                            actual = probe(trimmed, minimum=max(1,a.min_seconds-.15))
                            if abs(actual-shortened) > .15:
                                raise RuntimeError("Trim duration mismatch")
                            render_width, render_height = video_dimensions(trimmed)
                            render_speech = remap_speech(speech,cut.start,duration_before,plan)
                            render_cut = Candidate(0.,shortened,cut.score,cut.hook,cut.transcript,cut.reason)
                            render_source, kept = trimmed, plan
                            pacing_note = "Detected quiet pauses removed; speech protected"
                        else:
                            pacing_note = "No eligible pauses within minimum-duration guard"
                    else:
                        pacing_note = "No recognized speech; original timing retained"
                except Exception as exc:
                    print("Tight pacing fallback:",str(exc)[:150],flush=True)
                    pacing_note = "Trim unavailable; original timing retained"
                    render_source, render_cut, render_speech = video, cut, speech
                    render_width, render_height = width, height
                    kept = [(0.,duration_before)]
            sub = output / (base + ".srt")
            has_captions = captions_for(render_cut, render_speech, sub, a.caption_script)
            original = output / (base + ".original.srt")
            original_saved = a.caption_script == "roman" and captions_for(render_cut, render_speech, original)
            target = output / (base + ".mp4")
            crop_info = compute_crop(render_source, render_width, render_height, render_cut.start, render_cut.end, a.crop)
            print(f"Rendering Short #{i}: {cut.start}s -> {cut.end}s; crop: {crop_info['method']} at x={crop_info['crop_x']}", flush=True)
            render_sub = sub if has_captions else None
            animated = output / (base + ".ass")
            timing = None
            if a.caption_style == "karaoke":
                timing = write_animated(render_cut, render_speech, animated, a.caption_script)
                if sum(timing.values()):
                    render_sub = animated
            render(render_source, target, render_cut, render_sub, crop_info["crop_x"], a.caption_style, crop_info.get("path"))
            item = asdict(cut)
            item["mp4"] = target.name
            item["captions"] = sub.name if has_captions else None
            item["original_captions"] = original.name if original_saved else None
            item["animated_captions"] = animated.name if timing and sum(timing.values()) else None
            item["animated_timing_events"] = timing
            item["pacing"] = {"mode":a.pacing,"note":pacing_note,"kept_source_relative_intervals":kept,"duration_before":duration_before,"duration_after":render_cut.end-render_cut.start}
            item["framing"] = crop_info
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
