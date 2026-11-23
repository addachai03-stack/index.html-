import unittest
from unittest.mock import patch
import live_monitor


class ChannelValidationTests(unittest.TestCase):
    def test_twitch_and_youtube(self):
        self.assertEqual(live_monitor.validate_channel("twitch", "Streamer_Name"), "streamer_name")
        self.assertEqual(live_monitor.validate_channel("youtube", "@creator_name"), "@creator_name")
        self.assertEqual(live_monitor.validate_channel("youtube", "UC" + "x" * 22), "UC" + "x" * 22)

    def test_invalid_channel_rejected(self):
        for platform, channel in (
            ("twitch", "https://twitch.tv/user"),
            ("twitch", "../admin"),
            ("twitch", "someone?token=x"),
            ("youtube", "javascript:alert(1)"),
            ("youtube", "https://youtube.com/@creator"),
            ("other", "streamer"),
        ):
            with self.subTest(platform=platform, channel=channel), self.assertRaises(ValueError):
                live_monitor.validate_channel(platform, channel)


class OfficialAPITests(unittest.TestCase):
    def test_not_configured_never_claims_live(self):
        status = live_monitor.build_status("twitch", "somechannel", {})
        self.assertEqual(status["state"], "NOT_CONFIGURED")
        self.assertEqual(status["clips"], [])

    def test_live_and_offline_reconnect(self):
        with patch.object(live_monitor, "twitch_status", return_value={
            "state": "LIVE", "stream": {"id": "new"}, "clips": []
        }):
            status = live_monitor.build_status("twitch", "mychannel", {
                "TWITCH_CLIENT_ID": "id", "TWITCH_CLIENT_SECRET": "secret"
            }, {"platform": "twitch", "channel": "mychannel", "state": "OFFLINE", "restart_count": 2})
        self.assertEqual(status["state"], "LIVE")
        self.assertEqual(status["restart_count"], 3)
        self.assertIsNotNone(status["last_live_at"])

    def test_invalid_secret_does_not_leak(self):
        with patch.object(live_monitor, "twitch_status", side_effect=RuntimeError("secret-value-should-not-appear")):
            status = live_monitor.build_status("twitch", "mychannel", {
                "TWITCH_CLIENT_ID": "id", "TWITCH_CLIENT_SECRET": "secret"
            })
        self.assertEqual(status["state"], "API_ERROR")
        self.assertNotIn("secret-value-should-not-appear", str(status))

    @patch.object(live_monitor, "request_json")
    def test_youtube_uses_official_search_without_downloading(self, request):
        request.side_effect = [
            {"items": [{"id": "UC" + "x" * 22}]},
            {"items": [{"id": {"videoId": "abcdefghijk"}, "snippet": {
                "title": "Testing stream", "publishedAt": "2026-11-23T08:00:00Z"
            }}]}
        ]
        result = live_monitor.youtube_status("@creator", "fake-key")
        self.assertEqual(result["state"], "LIVE")
        self.assertEqual(result["stream"]["url"], "https://www.youtube.com/watch?v=abcdefghijk")
        self.assertEqual(result["clips"], [])
        self.assertEqual(request.call_count, 2)

    @patch.object(live_monitor, "request_json")
    def test_twitch_only_retains_official_clip_urls(self, request):
        request.side_effect = [
            {"access_token": "not-public"},
            {"data": [{"id": "123"}]},
            {"data": [{"id": "s1", "title": "Live", "started_at": "2026-11-23T12:00:00Z", "viewer_count": 10}]},
            {"data": [
                {"id": "c1", "url": "https://clips.twitch.tv/GoodClip", "title": "Nice", "view_count": 200, "duration": 30},
                {"id": "c2", "url": "https://evil.example/steal", "title": "Bad", "view_count": 400},
                {"id": "c3", "url": "https://clips.twitch.tv/Another", "title": "Good", "view_count": 20},
            ]},
        ]
        result = live_monitor.twitch_status("mychannel", "id", "secret")
        self.assertEqual(result["state"], "LIVE")
        self.assertEqual([x["id"] for x in result["clips"]], ["c1", "c3"])
        self.assertNotIn("not-public", str(result))


if __name__ == "__main__":
    unittest.main()
