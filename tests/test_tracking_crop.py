import tempfile
import unittest
import subprocess
import shutil
from pathlib import Path
from unittest.mock import patch
from tracking_crop import path_from_samples,crop_filter
from smartcrop import compute_crop
from studio import Candidate,render

class TrackingTests(unittest.TestCase):
    def test_path_and_fallback(self):
        self.assertEqual(path_from_samples([(0,.2)],3),[])
        path=path_from_samples([(0,.2),(1,.5),(2,.8)],3)
        self.assertEqual(path[0],(0,.2))
        self.assertEqual(path[-1],(3,.8))
        self.assertIn("if(lt(t,",crop_filter(path))
        with patch("tracking_crop.sample_faces",return_value=[(0,.2),(2,.8)]):
            result=compute_crop(Path("unused.mp4"),640,360,0,3,"track")
            self.assertEqual(result["method"],"face-guided-sampled-motion")
            self.assertEqual(result["face_frames"],2)
        with patch("tracking_crop.sample_faces",return_value=[]):
            self.assertEqual(compute_crop(Path("unused.mp4"),640,360,0,3,"track")["method"],"center")

    @unittest.skipUnless(shutil.which("ffmpeg"),"FFmpeg unavailable")
    def test_real_moving_crop_pixels(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/"sample.mp4"
            output=root/"moving.mp4"
            subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi",
                "-i","color=black:s=640x360:r=25:d=3",
                "-vf","drawbox=x=0:y=0:w=320:h=360:color=red:t=fill,drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill",
                "-c:v","libx264","-pix_fmt","yuv420p",str(source)],check=True)
            render(source,output,Candidate(0,3,1,"","",""),None,crop_path=[(0,.2),(3,.8)])
            def rgb(t):
                return subprocess.check_output(["ffmpeg","-v","error","-ss",str(t),"-i",str(output),
                   "-vf","crop=2:2:(iw-2)/2:(ih-2)/2","-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","-"])
            first,last=rgb(.1),rgb(2.8)
            self.assertGreater(first[0],first[2]+80)
            self.assertGreater(last[2],last[0]+80)
