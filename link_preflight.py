"""Owner-controlled read-only preflight: YouTube metadata only, no download/render."""
from __future__ import annotations
import json
import sys
from pathlib import Path

from studio import validate_url


def main():
    output = Path("preflight")
    output.mkdir(exist_ok=True)
    report = {"status": "started", "downloaded": False,
              "note": "Metadata probe only, not proof of renderability or content rights."}
    try:
        raw = Path("smoke/user-video-preflight.txt").read_text(encoding="utf-8").strip()
        url = validate_url(raw)
        report["url"] = url
        from yt_dlp import YoutubeDL
        opts = {
            "skip_download": True,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": False,
            "socket_timeout": 18,
            "retries": 1,
            "extractor_retries": 1,
            "ignoreerrors": False,
        }
        with YoutubeDL(opts) as ydl:
            metadata = ydl.extract_info(url, download=False)
        if not metadata:
            raise RuntimeError("Video metadata unavailable from GitHub runner.")
        report.update({
            "status": "metadata_available",
            "title": metadata.get("title"),
            "uploader": metadata.get("uploader"),
            "duration_seconds": metadata.get("duration"),
            "is_live": metadata.get("is_live"),
            "availability": metadata.get("availability"),
            "extractor": metadata.get("extractor_key"),
        })
        print("CUTNOVA_METADATA_OK", json.dumps(report, ensure_ascii=False), flush=True)
        return 0
    except Exception as exc:
        report["status"] = "metadata_unavailable"
        report["error"] = str(exc)[-800:]
        print("CUTNOVA_METADATA_BLOCKED", report["error"], flush=True)
        return 1
    finally:
        (output / "preflight_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    sys.exit(main())
