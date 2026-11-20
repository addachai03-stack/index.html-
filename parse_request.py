"""Parse GitHub-native CutNova Issue forms and legacy prefilled URL requests.

Never evaluate issue body content as shell commands or Python code.
"""
from __future__ import annotations

import os
import re
import sys

from studio import validate_url
from premium import normalize_style
from smartcrop import normalize_crop_mode
from speech_quality import normalize_language


FORM_LABELS = {
    "Video URL": "URL",
    "Number of Shorts": "CLIPS",
    "Minimum clip length (seconds)": "MIN_SECONDS",
    "Maximum clip length (seconds)": "MAX_SECONDS",
    "Highlight style": "STYLE",
    "Smart crop mode": "CROP",
    "Speech language": "LANGUAGE",
}
RIGHTS_LABEL = "Content ownership and permission"
RIGHTS_TEXT = "I own this video or have permission to edit and republish its content."


def issue_form_fields(body: str) -> dict[str, str]:
    """Parse GitHub's ### section labels and form values."""
    fields: dict[str, str] = {}
    sections = re.split(r"(?m)^###\s+", body)
    for section in sections[1:]:
        label, separator, rest = section.partition("\n")
        if not separator:
            continue
        label = label.strip()
        value = rest.strip()
        if label in FORM_LABELS:
            mapped = FORM_LABELS[label]
            if mapped in fields:
                raise ValueError("Duplicate Issue form field: " + label)
            if not value or value == "_No response_":
                raise ValueError("Missing Issue form field: " + label)
            if "\n" in value or "\r" in value:
                raise ValueError("Each Issue form field must have one line.")
            fields[mapped] = value
        elif label == RIGHTS_LABEL:
            checked = re.search(r"(?im)^\s*-\s*\[[x]\]\s+" + re.escape(RIGHTS_TEXT) + r"\s*$", value)
            fields["RIGHTS"] = "YES" if checked else "NO"
    return fields


def legacy_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in body.splitlines():
        match = re.fullmatch(r"(URL|CLIPS|MIN_SECONDS|MAX_SECONDS|RIGHTS|STYLE|CROP|LANGUAGE):[ \t]*(.+?)[ \t]*", line.strip())
        if match and match[1] not in fields:
            fields[match[1]] = match[2]
    return fields


def parse_issue(body: str) -> dict:
    if not isinstance(body, str) or len(body) > 12000:
        raise ValueError("CutNova Issue request is empty or too long.")
    if "CUTNOVA_REQUEST_V1" in body:
        fields = legacy_fields(body)
    else:
        fields = issue_form_fields(body)
    expected = ("URL", "CLIPS", "MIN_SECONDS", "MAX_SECONDS", "RIGHTS")
    if not all(k in fields for k in expected):
        raise ValueError("Missing required URL, clip settings or rights confirmation.")
    if fields["RIGHTS"].upper() != "YES":
        raise ValueError("Content ownership or edit permission is required.")
    url = validate_url(fields["URL"])
    raw_style = fields.get("STYLE", "engagement").strip().lower()
    display_styles = {
        "engagement — strong hooks and reveals": "engagement",
        "funny — jokes and reactions": "funny",
        "facts — interesting explainers": "facts",
        "story — suspense and twists": "story",
    }
    style = normalize_style(display_styles.get(raw_style, raw_style))
    raw_crop = fields.get("CROP", "auto").strip().lower()
    crop_labels = {
        "auto — face-aware static framing": "auto",
        "center — always center crop": "center",
    }
    crop = normalize_crop_mode(crop_labels.get(raw_crop, raw_crop))
    raw_language = fields.get("LANGUAGE", "auto").strip().lower()
    language_labels = {
        "auto — detect language": "auto",
        "hindi — prefer hindi speech": "hi",
        "english — prefer english speech": "en",
    }
    language = normalize_language(language_labels.get(raw_language, raw_language))
    try:
        clip_count = int(fields["CLIPS"])
        min_seconds = int(fields["MIN_SECONDS"])
        max_seconds = int(fields["MAX_SECONDS"])
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid clips count or duration.") from exc
    if not (1 <= clip_count <= 10 and 15 <= min_seconds <= max_seconds <= 60):
        raise ValueError("Clip count must be 1-10, clip duration 15-60 seconds.")
    return {
        "video_url": url,
        "clips": clip_count,
        "min_sec": min_seconds,
        "max_sec": max_seconds,
        "style": style,
        "crop": crop,
        "language": language,
    }


def main() -> None:
    request = parse_issue(os.environ.get("CUTNOVA_ISSUE_BODY", ""))
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        print(request)
        return
    with open(path, "a", encoding="utf-8") as file:
        for key, value in request.items():
            # The validated source URL and integer settings cannot inject output keys.
            print(f"{key}={value}", file=file)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Invalid CutNova issue:", exc, file=sys.stderr)
        raise SystemExit(1)
