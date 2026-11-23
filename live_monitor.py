#!/usr/bin/env python3
"""Read-only CutNova Auto Live monitor for officially published streamer data.

Never downloads streams, makes clips, posts content, or authenticates as a viewer.
The single configured channel and returned clip metadata are public GitHub Pages data.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

UTC = timezone.utc
CHANNEL_RE = re.compile(r"^[a-zA-Z0-9_]{3,25}$")
YOUTUBE_CHANNEL_RE = re.compile(r"^UC[a-zA-Z0-9_-]{22}$")
YOUTUBE_HANDLE_RE = re.compile(r"^@[a-zA-Z0-9._-]{3,30}$")


def now():
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def clip_text(value, limit=140):
    return str(value or "").strip()[:limit]


def validate_channel(platform, name):
    platform = str(platform or "").lower().strip()
    name = str(name or "").strip()
    if platform == "twitch" and CHANNEL_RE.fullmatch(name):
        return name.lower()
    if platform == "youtube" and (YOUTUBE_CHANNEL_RE.fullmatch(name) or YOUTUBE_HANDLE_RE.fullmatch(name)):
        return name
    raise ValueError("Use a Twitch username, a YouTube @handle, or a YouTube UC channel ID.")


def request_json(url, *, method="GET", payload=None, headers=None, timeout=22):
    data = urlencode(payload).encode("utf-8") if payload is not None else None
    req = Request(url, data=data, headers=headers or {}, method=method)
    with urlopen(req, timeout=timeout) as response:
        # Limit response memory and refuse oversized API payloads.
        body = response.read(512 * 1024 + 1)
    if len(body) > 512 * 1024:
        raise ValueError("Official API response too large")
    return json.loads(body)


def twitch_status(channel, client_id, client_secret):
    token = request_json("https://id.twitch.tv/oauth2/token", method="POST", payload={
        "client_id": client_id, "client_secret": client_secret, "grant_type": "client_credentials",
    }).get("access_token")
    if not token:
        raise RuntimeError("Twitch app token unavailable")
    auth = {"Client-Id": client_id, "Authorization": "Bearer " + token}
    users = request_json("https://api.twitch.tv/helix/users?" + urlencode({"login": channel}), headers=auth).get("data", [])
    if not users:
        return {"state": "NOT_FOUND", "stream": None, "clips": []}
    user_id = str(users[0]["id"])
    data = request_json("https://api.twitch.tv/helix/streams?" + urlencode({"user_id": user_id}), headers=auth).get("data", [])
    live = data[0] if data else None
    if live:
        start = clip_text(live.get("started_at"), 40)
        stream = {
            "id": clip_text(live.get("id"), 64), "title": clip_text(live.get("title"), 200),
            "started_at": start, "game_name": clip_text(live.get("game_name"), 80),
            "viewer_count": max(0, int(live.get("viewer_count") or 0)),
            "url": "https://www.twitch.tv/" + channel,
        }
    else:
        stream = None
    # Official Twitch clips ALREADY MADE by creators/viewers: not AI highlights,
    # nor video files created by CutNova. May be empty despite a live stream.
    since = (datetime.now(UTC) - timedelta(hours=48)).isoformat(timespec="seconds").replace("+00:00", "Z")
    clips = request_json("https://api.twitch.tv/helix/clips?" + urlencode({
        "broadcaster_id": user_id, "first": 20, "started_at": since
    }), headers=auth).get("data", [])
    safe_clips = []
    for item in clips:
        uri = str(item.get("url") or "")
        if not (uri.startswith("https://clips.twitch.tv/") or uri.startswith("https://www.twitch.tv/")):
            continue
        safe_clips.append({
            "id": clip_text(item.get("id"), 100),
            "title": clip_text(item.get("title"), 140),
            "url": uri[:350], "view_count": max(0, int(item.get("view_count") or 0)),
            "created_at": clip_text(item.get("created_at"), 40),
            "duration": max(0, float(item.get("duration") or 0)),
        })
    safe_clips.sort(key=lambda c: c["view_count"], reverse=True)
    return {"state": "LIVE" if live else "OFFLINE", "stream": stream, "clips": safe_clips[:12]}


def youtube_status(channel, api_key):
    base = "https://www.googleapis.com/youtube/v3/"
    if channel.startswith("@"):
        resolved = request_json(base + "channels?" + urlencode({
            "part": "id", "forHandle": channel, "key": api_key
        })).get("items", [])
        if not resolved:
            return {"state": "NOT_FOUND", "stream": None, "clips": []}
        channel_id = resolved[0]["id"]
    else:
        channel_id = channel
    items = request_json(base + "search?" + urlencode({
        "part": "snippet", "channelId": channel_id, "eventType": "live",
        "type": "video", "maxResults": 1, "key": api_key,
    })).get("items", [])
    video = items[0] if items else None
    if video:
        video_id = clip_text((video.get("id") or {}).get("videoId"), 20)
        if not re.fullmatch(r"[a-zA-Z0-9_-]{11}", video_id):
            raise ValueError("YouTube returned an invalid public video identifier")
        snippet = video.get("snippet") or {}
        stream = {
            "id": video_id, "title": clip_text(snippet.get("title"), 200),
            "started_at": clip_text(snippet.get("publishedAt"), 40),
            "game_name": "", "viewer_count": None,
            "url": "https://www.youtube.com/watch?v=" + video_id,
        }
    else:
        stream = None
    # YouTube's search API supplies current public live metadata, not video
    # extraction, chat peaks, automatic clips, or permission to republish.
    return {"state": "LIVE" if video else "OFFLINE", "stream": stream, "clips": []}


def build_status(platform, channel, secrets, previous=None):
    result = {
        "schema_version": 1, "platform": str(platform or "").lower().strip(),
        "channel": str(channel or "").strip(), "checked_at": now(),
        "state": "NOT_CONFIGURED", "stream": None, "clips": [],
        "clip_source": "official_public_existing_twitch_clips_only",
        "polling": "scheduled_not_realtime",
        "note": "Read-only official API monitor. No auto clip recording, AI ranking, DM, or uploads.",
        "last_live_at": None, "restart_count": 0,
    }
    if not channel or not platform:
        return result
    try:
        channel = validate_channel(platform, channel)
        result["channel"] = channel
        if platform == "twitch":
            if not (secrets.get("TWITCH_CLIENT_ID") and secrets.get("TWITCH_CLIENT_SECRET")):
                return result
            data = twitch_status(channel, secrets["TWITCH_CLIENT_ID"], secrets["TWITCH_CLIENT_SECRET"])
        else:
            if not secrets.get("YOUTUBE_API_KEY"):
                return result
            data = youtube_status(channel, secrets["YOUTUBE_API_KEY"])
        result.update(data)
        old = previous or {}
        if old.get("platform") == platform and old.get("channel") == channel:
            result["restart_count"] = max(0, int(old.get("restart_count") or 0))
            result["last_live_at"] = old.get("last_live_at")
            if result["state"] == "LIVE" and old.get("state") == "OFFLINE":
                result["restart_count"] += 1
        if result["state"] == "LIVE":
            result["last_live_at"] = result["checked_at"]
    except ValueError:
        result["state"] = "INVALID_CHANNEL"
        result["note"] = "Invalid channel configuration. Check repository variables."
    except Exception:
        result["state"] = "API_ERROR"
        result["note"] = "Official stream lookup failed. Check API settings and workflow logs; no live state is verified."
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", default=os.environ.get("CUTNOVA_STREAM_PLATFORM", ""))
    parser.add_argument("--channel", default=os.environ.get("CUTNOVA_STREAM_CHANNEL", ""))
    parser.add_argument("--output", default="autolive/status.json")
    args = parser.parse_args()
    path = Path(args.output)
    old = {}
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    data = build_status(args.platform, args.channel, os.environ, old)
    # Missing credentials/configuration should not generate pointless public commits
    # on every scheduled run. Do not present a fake recent successful check.
    if (data["state"] == "NOT_CONFIGURED" and old.get("state") == "NOT_CONFIGURED"
            and old.get("platform") == data["platform"]
            and old.get("channel") == data["channel"]):
        data["checked_at"] = old.get("checked_at")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("CUTNOVA_AUTOLIVE", data["platform"], data["channel"], data["state"],
          "official_clips=" + str(len(data["clips"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
