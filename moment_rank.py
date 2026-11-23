"""Rank already-published public Twitch clips using official metadata only.

No stream capture, video analysis, ASR, reposting, or viral-performance prediction.
The numeric score is a transparent review-priority heuristic, not AI or proof of
highlight quality. Input clips are already rights-agnostic public metadata.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit


def official_clip_url(url: object) -> bool:
    if not isinstance(url, str) or len(url) > 350 or any(ord(c) < 32 for c in url):
        return False
    try:
        u = urlsplit(url)
        if u.scheme != "https" or u.username or u.password or u.port or u.query or u.fragment:
            return False
        host = (u.hostname or "").lower()
        if host == "clips.twitch.tv":
            return bool(re.fullmatch(r"/[A-Za-z0-9_-]{3,150}/?", u.path))
        if host in ("www.twitch.tv", "twitch.tv"):
            return bool(re.fullmatch(r"/[A-Za-z0-9_]{3,25}/clip/[A-Za-z0-9_-]{3,150}/?", u.path))
    except ValueError:
        return False
    return False


def parse_created_at(value: object) -> datetime | None:
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def rank_public_moments(clips: object, *, checked_at: datetime | None = None,
                        limit: int = 6, min_duration: float = 15,
                        max_duration: float = 60) -> list[dict]:
    """Return up to six unique official clips suitable for a manual review queue.

    Only official clip URL, published time, view count and duration are scored.
    Too-old, future-dated, invalid-host and out-of-range clips never qualify.
    """
    clock = checked_at or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        raise ValueError("checked_at must be timezone aware")
    clock = clock.astimezone(timezone.utc)
    eligible = {}
    for raw in clips if isinstance(clips, (list, tuple)) else []:
        if not isinstance(raw, dict):
            continue
        url = raw.get("url")
        clip_id = str(raw.get("id") or "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", clip_id) or not official_clip_url(url):
            continue
        try:
            duration = float(raw.get("duration"))
            views = int(raw.get("view_count"))
        except (ValueError, TypeError, OverflowError):
            continue
        if not (math.isfinite(duration) and min_duration <= duration <= max_duration):
            continue
        if views < 0 or views > 2_147_483_647:
            continue
        created = parse_created_at(raw.get("created_at"))
        # Exclude unknown timestamps; public Twitch clips always expose created_at.
        if created is None:
            continue
        age_hours = (clock - created).total_seconds() / 3600
        if not (0 <= age_hours <= 48):
            continue
        candidate = {
            "id": clip_id,
            "url": url,
            "title": str(raw.get("title") or "Untitled clip").strip()[:140],
            "view_count": views,
            "duration": round(duration, 2),
            "created_at": created.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "age_hours": round(age_hours, 1),
            "_velocity": views / max(1.0, age_hours),
        }
        previous = eligible.get(clip_id)
        if previous is None or candidate["view_count"] > previous["view_count"]:
            eligible[clip_id] = candidate

    candidates = list(eligible.values())
    if not candidates:
        return []
    most_views = max(item["view_count"] for item in candidates)
    most_velocity = max(item["_velocity"] for item in candidates)
    for item in candidates:
        view_score = 45 * math.log1p(item["view_count"]) / math.log1p(most_views) if most_views else 0
        traction_score = 25 * math.log1p(item["_velocity"]) / math.log1p(most_velocity) if most_velocity else 0
        length_score = 20 if 20 <= item["duration"] <= 45 else 15
        age = item["age_hours"]
        recency_score = 10 if age <= 6 else 7 if age <= 24 else 3
        item["review_score"] = round(view_score + traction_score + length_score + recency_score)
        reasons = []
        if item["view_count"] == most_views and most_views > 0:
            reasons.append("Most views in this fetched sample")
        elif item["view_count"] > 0:
            reasons.append("Public view count")
        if most_velocity and item["_velocity"] >= most_velocity * 0.8:
            reasons.append("Recent views relative to age")
        reasons.append("15–60 second clip")
        if age <= 6:
            reasons.append("Published within 6 hours")
        item["review_reasons"] = reasons
        del item["_velocity"]

    candidates.sort(key=lambda clip: (-clip["review_score"], -clip["view_count"], clip["created_at"], clip["id"]))
    bounded = max(0, min(6, int(limit)))
    return candidates[:bounded]
