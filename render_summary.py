#!/usr/bin/env python3
"""Summarize real CutNova render results without inventing output files."""
from __future__ import annotations

import json
from pathlib import Path


def md(text: object) -> str:
    """Treat renderer error text as display data, not Markdown or HTML."""
    s = str(text or "").replace("\n", " ").replace("\r", " ")
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("|", "\\|")[:1200]


def summary(report: dict) -> str:
    state = str(report.get("status", "unknown"))
    if state == "completed":
        count = int(report.get("count") or 0)
        videos = [v for v in (report.get("videos") or []) if isinstance(v, str) and v.endswith(".mp4")]
        if not count or not videos:
            return "### CutNova render: no verified MP4 outputs\n\nCompleted was reported but no MP4 filenames were recorded. Check artifacts and logs.\n"
        return ("### CutNova render completed\n\n"
                f"**MP4 Shorts reported:** {count}\n\n"
                + "\n".join("- `" + md(v) + "`" for v in videos)
                + "\n\n**AI creator text:** inspect `CutNova_Shorts.zip` for `Creator_Pack.json`, `Posting_Guide.md` and per-short posting files. Always check the uploaded artifact before claiming a downloadable video.\n")
    if state == "failed":
        code = md(report.get("failure_code", "RENDER_FAILED"))
        guidance = md(report.get("recovery", "Review the failing step logs."))
        return ("### CutNova render failed — no new MP4 claimed\n\n"
                f"**Failure code:** `{code}`\n\n"
                f"**Next step:** {guidance}\n\n"
                "GitHub rejected or failed the video processing request. Review the `Generate real portrait Shorts` logs and `report.json` artifact.\n")
    return "### CutNova render result not yet available\n\nNo completed success should be assumed.\n"


def main() -> None:
    reportfile = Path("output/report.json")
    try:
        report = json.loads(reportfile.read_text(encoding="utf-8"))
        if not isinstance(report, dict):
            report = {}
    except (ValueError, OSError):
        report = {}
    print(summary(report))


if __name__ == "__main__":
    main()
