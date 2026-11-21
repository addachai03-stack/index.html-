"""Real media and safety regression tests for owner public-URL H264/AAC converter."""
from __future__ import annotations
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from social_convert import (
    validate_source, ffmpeg_command, source_media, verified_output,
    probe, convert, MAX_CONVERT_BYTES,
)

class SocialConvertTests(unittest.TestCase):
    def test_reject_secrets_and_private_urls(self):
        unsafe=[
            "http://cdn.example.com/a.mp4",
            "https://127.0.0.1/demo.mp4",
            "https://localhost/private.mp4",
            "https://192.168.1.1/video.mp4",
            "https://example.com/a.mp4?token=abc",
            "https://test:secret@example.com/a.mp4",
            "https://cdn.example.com:8443/a.mp4",
            "https://cdn.example.com/a.mp4#secret",
            "https://example.com/private",
            "https://example.com/a.mp4\nHI",
            "https://private.internal/a.mp4",
        ]
        for item in unsafe:
            with self.subTest(item=item),self.assertRaises(ValueError):
                validate_source(item)
        self.assertEqual(validate_source("https://cdn.example.com/media/sample.mp4"),
                         "https://cdn.example.com/media/sample.mp4")
        self.assertEqual(validate_source("https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000"),
                         "https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000")

    def test_reject_wrong_codecs_despite_mp4_name(self):
        info={"format":{"duration":"2.1"},"streams":[
            {"codec_type":"video","codec_name":"vp9","width":720,"height":1280,"pix_fmt":"yuv420p"},
            {"codec_type":"audio","codec_name":"opus"}]}
        with self.assertRaisesRegex(ValueError,"H.264"):
            verified_output(info)
        info["streams"][0]["codec_name"]="h264"
        info["streams"][1]["codec_name"]="aac"
        self.assertEqual(verified_output(info)["video_codec"],"h264")
        info["streams"][0]["width"]=1280
        with self.assertRaisesRegex(ValueError,"9:16"):
            verified_output(info)

    def test_ffmpeg_never_just_renames_and_adds_audio_when_missing(self):
        cmd=ffmpeg_command(Path("input.mp4"),Path("out.mp4"),False,2)
        for key in ("libx264","aac","yuv420p","anullsrc=channel_layout=stereo:sample_rate=44100",
                    "scale=720:1280:force_original_aspect_ratio=increase,",
                    "+faststart"):
            self.assertIn(key," ".join(cmd))
        self.assertNotIn("-c",cmd,"Converter must not use stream copy")

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),"FFmpeg unavailable")
    def test_really_transcodes_vp9_opus_to_h264_aac(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            src=root/"original.webm"
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i","testsrc2=size=192x256:rate=12",
                "-f","lavfi","-i","sine=frequency=330:sample_rate=44100",
                "-t","1.6","-c:v","libvpx-vp9","-b:v","240k",
                "-c:a","libopus","-b:a","56k","-shortest",str(src)
            ],check=True,timeout=50,capture_output=True)
            before=probe(src)
            self.assertEqual(next(s["codec_name"] for s in before["streams"] if s["codec_type"]=="video"),"vp9")
            self.assertEqual(next(s["codec_name"] for s in before["streams"] if s["codec_type"]=="audio"),"opus")
            out=root/"verified-social.mp4"
            report=convert(src,out)
            self.assertTrue(out.exists())
            self.assertEqual(report["video_codec"],"h264")
            self.assertEqual(report["audio_codec"],"aac")
            self.assertEqual(report["width"],720)
            self.assertEqual(report["height"],1280)
            self.assertGreater(report["size_bytes"],4096)
            self.assertFalse(report["social_upload_tested"])
            self.assertFalse(report["source_had_audio"] is False)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),"FFmpeg unavailable")
    def test_silent_source_receives_aac_track(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            src=root/"silent.mp4"
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i","color=c=black:s=180x240:r=12",
                "-t","1.1","-c:v","libx264","-pix_fmt","yuv420p",str(src)
            ],check=True,timeout=45,capture_output=True)
            out=root/"silent-social.mp4"
            report=convert(src,out)
            self.assertFalse(report["source_had_audio"])
            self.assertEqual(report["audio_codec"],"aac")
            self.assertEqual(report["video_codec"],"h264")

if __name__=="__main__":
    unittest.main()
