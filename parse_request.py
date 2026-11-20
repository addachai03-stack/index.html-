"""Parse a CutNova GitHub Issue request without evaluating shell syntax."""
from __future__ import annotations
import os
import re
import sys
from studio import validate_url


def parse_issue(body: str) -> dict:
    if len(body) > 12000 or "CUTNOVA_REQUEST_V1" not in body:
        raise ValueError("Not a CutNova request.")
    fields = {}
    for line in body.splitlines():
        match = re.match(r"^(URL|CLIPS|MIN_SECONDS|MAX_SECONDS|RIGHTS):\s*(.+?)\s*$", line.strip())
        if match and match[1] not in fields:
            fields[match[1]] = match[2]
    if not all(k in fields for k in ("URL", "CLIPS", "MIN_SECONDS", "MAX_SECONDS", "RIGHTS")):
        raise ValueError("Incomplete URL, clip settings or rights confirmation.")
    if fields["RIGHTS"].upper() != "YES":
        raise ValueError("Content ownership/permission confirmation required.")
    url = validate_url(fields["URL"])
    values = {key: int(fields[key]) for key in ("CLIPS", "MIN_SECONDS", "MAX_SECONDS")}
    if not (1 <= values["CLIPS"] <= 10 and
            15 <= values["MIN_SECONDS"] <= values["MAX_SECONDS"] <= 60):
        raise ValueError("Clip count 1-10, duration 15-60.")
    return {"video_url": url, "clips": values["CLIPS"],
            "min_sec": values["MIN_SECONDS"], "max_sec": values["MAX_SECONDS"]}


def main():
    request = parse_issue(os.environ.get("CUTNOVA_ISSUE_BODY", ""))
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        print(request)
        return
    with open(path, "a", encoding="utf-8") as fh:
        for key, value in request.items():
            # validated URL contains no CR/LF; cannot inject a new output key.
            print(f"{key}={value}", file=fh)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Invalid Shorts issue:", exc, file=sys.stderr)
        raise SystemExit(1)
