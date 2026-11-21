#!/usr/bin/env python3
"""Owner-only social MP4 conversion of explicitly authorized public video URLs.

No browser upload, credentials, private URL, social scraping, DRM bypass or
iPhone Files access. GitHub Actions is public, including its inputs and logs.
"""
from __future__ import annotations
import argparse
import ipaddress
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qsl
from direct_media import download_direct
from github_media import is_github_attachment_url, download_github_attachment

MAX_CONVERT_BYTES = 100 * 1024 * 1024
MAX_DURATION = 65.0
SENSITIVE_KEYS = {
    "token","access_token","auth","authorization","password","key",
    "api_key","signature","sig","credential","expires",
}
VIDEO_SUFFIX = re.compile(r"\.(mp4|mov|m4v|webm)$", re.IGNORECASE)


def validate_source(url: str) -> str:
    if not isinstance(url, str) or not url or len(url)>1800:
        raise ValueError("Public media URL must be 1-1800 characters.")
    if any(ord(c)<33 or ord(c)==127 for c in url) or "\\" in url:
        raise ValueError("Unsafe URL character.")
    p=urlparse(url)
    if (p.scheme!="https" or not p.hostname or p.username or p.password
        or p.port is not None or p.fragment or p.query):
        raise ValueError("Only public unsigned HTTPS media URLs without query strings are accepted.")
    if p.hostname=="localhost" or p.hostname.endswith((".local",".internal",".localhost")):
        raise ValueError("Local/private media hosts are forbidden.")
    try:
        ipaddress.ip_address(p.hostname)
        raise ValueError("Raw IP-address URLs are forbidden.")
    except ValueError as e:
        if "forbidden" in str(e): raise
    if not VIDEO_SUFFIX.search(p.path) and not is_github_attachment_url(url):
        raise ValueError("Provide a direct public MP4/MOV/WebM URL or a public GitHub attachment.")
    # DNS/IP checks at connection time are handled by the pinned TLS downloader.
    # GitHub asset redirects use a strict allowlist and independently checked IPs.
    return url


def run(command: list[str], timeout: int=300) -> subprocess.CompletedProcess:
    p=subprocess.run(command,text=True,capture_output=True,timeout=timeout,check=False)
    if p.returncode:
        raise RuntimeError(command[0]+" failed: "+(p.stderr or p.stdout)[-1200:])
    return p


def probe(path: Path) -> dict:
    raw=run(["ffprobe","-nostdin","-v","error","-show_format","-show_streams",
             "-of","json",str(path)],timeout=30)
    try:
        return json.loads(raw.stdout)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValueError("Cannot read actual media metadata.") from e


def duration_seconds(info: dict) -> float:
    def positive(v):
        try:
            n=float(v)
            return n if 0<n<float("inf") else None
        except (ValueError,TypeError): return None
    return positive(info.get("format",{}).get("duration")) or next((
        n for s in info.get("streams",[]) if s.get("codec_type")=="video"
        if (n:=positive(s.get("duration"))) is not None
    ),0.0)


def source_media(info: dict) -> tuple[bool,float]:
    videos=[s for s in info.get("streams",[]) if s.get("codec_type")=="video"]
    if not videos: raise ValueError("Input has no video stream.")
    v=videos[0]
    width,height=int(v.get("width") or 0),int(v.get("height") or 0)
    if width<16 or height<16 or width>3840 or height>2160:
        raise ValueError("Input video dimensions unsupported.")
    duration=duration_seconds(info)
    if not 1.0<=duration<=MAX_DURATION:
        raise ValueError("Use a 1-65-second source. Larger videos need editing first.")
    return any(s.get("codec_type")=="audio" for s in info.get("streams",[])),duration


def ffmpeg_command(source: Path, target: Path, audio_present: bool, duration: float)->list[str]:
    cmd=["ffmpeg","-nostdin","-hide_banner","-v","error","-y","-i",str(source)]
    if not audio_present:
        cmd.extend(["-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100"])
    cmd.extend(["-map","0:v:0","-map",("0:a:0" if audio_present else "1:a:0"),
                "-vf","scale=720:1280:force_original_aspect_ratio=increase,"
                      "crop=720:1280,setsar=1",
                "-c:v","libx264","-preset","veryfast","-crf","25",
                "-pix_fmt","yuv420p","-r","30",
                "-c:a","aac","-ar","44100","-b:a","128k",
                "-t",str(min(duration+0.3,MAX_DURATION)),
                "-movflags","+faststart","-shortest",
                str(target)])
    return cmd


def verified_output(info: dict)->dict:
    videos=[s for s in info.get("streams",[]) if s.get("codec_type")=="video"]
    audios=[s for s in info.get("streams",[]) if s.get("codec_type")=="audio"]
    if len(videos)!=1 or len(audios)!=1:
        raise ValueError("Converted MP4 must contain one video and one audio stream.")
    v,a=videos[0],audios[0]
    if v.get("codec_name")!="h264" or a.get("codec_name")!="aac":
        raise ValueError("Conversion failed to produce actual H.264 + AAC.")
    if (v.get("width"),v.get("height"))!=(720,1280) or v.get("pix_fmt")!="yuv420p":
        raise ValueError("Converted video failed 9:16/yuv420p verification.")
    d=duration_seconds(info)
    if not 0.8<=d<=MAX_DURATION:
        raise ValueError("Converted video has an invalid duration.")
    return {"video_codec":v["codec_name"],"audio_codec":a["codec_name"],
            "width":720,"height":1280,"pixel_format":"yuv420p",
            "duration_sec":round(d,3)}


def convert(source: Path,target: Path)->dict:
    info=probe(source)
    has_audio,duration=source_media(info)
    target.parent.mkdir(parents=True,exist_ok=True)
    try:
        run(ffmpeg_command(source,target,has_audio,duration),timeout=800)
        if not target.is_file() or target.stat().st_size<4096:
            raise RuntimeError("No valid converted MP4 was produced.")
        report=verified_output(probe(target))
        report.update({"file":target.name,"size_bytes":target.stat().st_size,
                       "source_had_audio":has_audio,
                       "rights_confirmed_for_public_source":True,
                       "social_upload_tested":False})
        return report
    except Exception:
        target.unlink(missing_ok=True)
        raise


def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--url",required=True,help="Owner-authorized public direct HTTPS video, not private iPhone Files")
    parser.add_argument("--rights-confirmed",action="store_true")
    args=parser.parse_args()
    if not args.rights_confirmed:
        raise ValueError("Explicit rights confirmation required.")
    url=validate_source(args.url)
    output=Path("output");output.mkdir(exist_ok=True)
    target=output/"CutNova_Social_Ready_H264_AAC.mp4"
    report_file=output/"social_conversion_report.json"
    with tempfile.TemporaryDirectory(prefix="cutnova-social-") as directory:
        work=Path(directory)
        if is_github_attachment_url(url):
            source=download_github_attachment(url,work)
        else:
            source=download_direct(url,work,max_bytes=MAX_CONVERT_BYTES)
        if source.stat().st_size>MAX_CONVERT_BYTES:
            raise ValueError("This conversion accepts media no larger than 100 MiB.")
        report=convert(source,target)
        report["source_type"]="public-github-attachment" if is_github_attachment_url(url) else "public-direct-https"
        # Avoid persisting signed/private URL strings in reports or logs.
        report_file.write_text(json.dumps(report,indent=2)+"\n")
        print("VERIFIED: real 720x1280 H.264 video + AAC audio MP4; not a social upload test.",flush=True)
    return 0


if __name__=="__main__":
    try: sys.exit(main())
    except Exception as exc:
        # Detailed internal errors stay in workflow logs; no claimed MP4.
        print("SOCIAL CONVERSION FAILED:",str(exc)[-1100:],file=sys.stderr)
        sys.exit(1)
