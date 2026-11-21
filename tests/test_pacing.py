import shutil
import tempfile
import unittest
import json
import subprocess
from pathlib import Path
from pacing import keep_intervals,silence_intervals,remap_speech,trim_media
from studio import Segment,Candidate,captions_for
from animated_captions import write_animated

class PacingTests(unittest.TestCase):
    def test_minimum_and_speech_guard(self):
        k=keep_intervals(20,[(2,18)],[(0,3),(9,10),(17,20)],15)
        self.assertGreaterEqual(sum(b-a for a,b in k),14.999)
        for x,y in [(0,3),(9,10),(17,20)]:
            self.assertTrue(any(a<=x and b>=y for a,b in k))
        self.assertEqual(keep_intervals(20,[(0,20)],[],15),[(0.,20)])
        self.assertEqual(silence_intervals("silence_start: 2\nsilence_end: 5",10),[(2.,5.)])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),"FFmpeg unavailable")
    def test_real_trim_and_subtitle_time(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); src=p/"src.mp4"; dest=p/"cut.mp4"
            subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","color=b=black:s=320x240:r=25:d=8".replace("b=black","c=black"),
                "-f","lavfi","-i","sine=frequency=440:duration=8",
                "-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",str(src)],check=True)
            keep=[(0,2),(4,8)]
            trim_media(src,dest,keep,0)
            info=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries","stream=codec_type,duration:format=duration","-of","json",str(dest)]))
            self.assertAlmostEqual(float(info["format"]["duration"]),6,delta=.12)
            for stream in info["streams"]:
                self.assertAlmostEqual(float(stream["duration"]),6,delta=.12)
            words=( (5.,5.5,"Hello"),(5.5,6.,"world") )
            adjusted=remap_speech([Segment(5,6,"Hello world",words)],0,8,keep)
            self.assertEqual(adjusted[0].start,3)
            self.assertEqual(adjusted[0].words[0],(3.,3.5,"Hello"))
            cut=Candidate(0,6,0,"","","")
            self.assertTrue(captions_for(cut,adjusted,p/"clip.srt"))
            self.assertIn("00:00:03,000 --> 00:00:04,000",(p/"clip.srt").read_text())
            self.assertEqual(write_animated(cut,adjusted,p/"clip.ass")["asr_words"],2)
            self.assertIn("0:00:03.00,0:00:03.50",(p/"clip.ass").read_text())
