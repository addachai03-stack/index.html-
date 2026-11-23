import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from moment_rank import official_clip_url, rank_public_moments
import live_monitor


NOW = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)


def clip(clip_id, views=100, hours_old=2, duration=30, url=None):
    created = NOW - timedelta(hours=hours_old)
    return {
        "id": clip_id, "url": url or "https://clips.twitch.tv/" + clip_id,
        "title": "Actual Twitch clip " + clip_id,
        "created_at": created.isoformat().replace("+00:00", "Z"),
        "view_count": views, "duration": duration,
    }


class MomentRankTests(unittest.TestCase):
    def test_public_official_clip_hosts_only(self):
        self.assertTrue(official_clip_url("https://clips.twitch.tv/GreatClip"))
        self.assertTrue(official_clip_url("https://www.twitch.tv/streamer/clip/GreatClip"))
        for value in (
            "https://clips.twitch.tv.evil.example/GreatClip",
            "https://clips.twitch.tv/GreatClip?token=secret",
            "https://clips.twitch.tv@evil.example/GreatClip",
            "http://clips.twitch.tv/GreatClip",
            "https://clips.twitch.tv/../../admin",
        ):
            with self.subTest(value=value):
                self.assertFalse(official_clip_url(value))

    def test_rank_filters_old_future_invalid_and_duplicate(self):
        items = [
            clip("HighViews", 2300, 5, 31),
            clip("LowViews", 40, 2, 35),
            clip("VeryOld", 9999, 60, 30),
            clip("Future", 9000, -1, 20),
            clip("TooLong", 9000, 1, 75),
            clip("TooShort", 9000, 1, 12),
            clip("HighViews", 5, 5, 31),
            clip("EvilLink", 9999, 1, 25, "https://clips.twitch.tv.evil.example/Clip"),
        ]
        ranked = rank_public_moments(items, checked_at=NOW)
        self.assertEqual({m["id"] for m in ranked}, {"HighViews", "LowViews"})
        self.assertEqual(ranked[0]["id"], "HighViews")
        self.assertLessEqual(ranked[0]["review_score"], 100)
        self.assertGreaterEqual(ranked[-1]["review_score"], 0)
        self.assertEqual(len(ranked[0]["review_reasons"]) > 0, True)
        self.assertEqual(ranked[0]["view_count"], 2300)

    def test_zero_views_and_maximum_six(self):
        items = [clip("Moment" + str(i), 0, 4, 30) for i in range(10)]
        ranked = rank_public_moments(items, checked_at=NOW, limit=99)
        self.assertEqual(len(ranked), 6)
        self.assertTrue(all(0 <= m["review_score"] <= 100 for m in ranked))
        self.assertEqual(rank_public_moments([], checked_at=NOW), [])

    def test_blank_timestamps_never_fabricate_recency(self):
        item = clip("ClipWithNoClock")
        item["created_at"] = ""
        self.assertEqual(rank_public_moments([item], checked_at=NOW), [])

    def test_integrated_twitch_monitor_ranks_metadata_not_video(self):
        info = {
            "state": "OFFLINE", "stream": None,
            "clips": [clip("Popular", 3500, 1, 27), clip("Recent", 200, 1, 31)],
        }
        # The synthetic fixed dates are intentionally evaluated against current
        # clock; call the scorer independently above for deterministic ranks.
        with patch.object(live_monitor, "twitch_status", return_value=info), \
             patch.object(live_monitor, "rank_public_moments", return_value=[{"id": "Popular"}]) as mocked:
            status = live_monitor.build_status("twitch", "streamer", {
                "TWITCH_CLIENT_ID": "not-real", "TWITCH_CLIENT_SECRET": "not-real",
            })
        self.assertEqual(status["state"], "OFFLINE")
        self.assertEqual(status["moment_candidates"], [{"id": "Popular"}])
        mocked.assert_called_once()
        self.assertEqual(status["polling"], "scheduled_not_realtime")

    def test_youtube_and_not_configured_remain_empty(self):
        status = live_monitor.build_status("twitch", "streamer", {})
        self.assertEqual(status["moment_candidates"], [])
        with patch.object(live_monitor, "youtube_status", return_value={
            "state": "LIVE", "stream": {"id": "abcdefghijk"}, "clips": []
        }):
            yt = live_monitor.build_status("youtube", "@creator", {"YOUTUBE_API_KEY": "test"})
        self.assertEqual(yt["moment_candidates"], [])


if __name__ == "__main__":
    unittest.main()
