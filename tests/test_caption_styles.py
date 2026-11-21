import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from caption_styles import STYLES, subtitle_style
from studio import Candidate, render
from parse_request import parse_issue

class CaptionPresetTests(unittest.TestCase):
    def test_presets(self):
        self.assertIn("PrimaryColour=&H00FFFFFF", subtitle_style("classic"))
        self.assertIn("PrimaryColour=&H0000EBFF", subtitle_style("yellow"))
        self.assertIn("BorderStyle=3", subtitle_style("boxed"))
        self.assertEqual(subtitle_style(), subtitle_style("classic"))
        with self.assertRaises(ValueError):
            subtitle_style("yellow,filter=unsafe")

    def test_actual_render_receives_selected_preset(self):
        cut = Candidate(0,15,1,"test","","test")
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "clip.mp4"
            captions = root / "clip.srt"
            captions.write_text("1\n00:00:00,000 --> 00:00:02,000\nHello\n")
            def simulated_ffmpeg(args, **kwargs):
                out.write_bytes(b"x"*8192)
            for preset in STYLES:
                with patch("studio.run", side_effect=simulated_ffmpeg) as ffmpeg:
                    render(root / "source.mp4", out, cut, captions, caption_style=preset)
                    cmd = ffmpeg.call_args.args[0]
                    self.assertIn("force_style='" + subtitle_style(preset) + "'",cmd[cmd.index("-vf")+1])

    @patch("studio.socket.getaddrinfo", return_value=[(0,0,0,"",("1.1.1.1",443))])
    def test_issue_style_and_default(self, _):
        body = "CUTNOVA_REQUEST_V1\nURL: https://remotion.media/video-30s.mp4\nCLIPS: 3\nMIN_SECONDS: 15\nMAX_SECONDS: 60\nRIGHTS: YES\n"
        self.assertEqual(parse_issue(body)["caption_style"],"classic")
        self.assertEqual(parse_issue(body+"CAPTION_STYLE: yellow\n")["caption_style"],"yellow")
        with self.assertRaises(ValueError):
            parse_issue(body+"CAPTION_STYLE: unknown\n")
