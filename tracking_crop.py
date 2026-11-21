"""Sampled face-guided horizontal crop path for portrait clips.

Frontal-face detections are sampled at roughly 1-second intervals. We prefer
the face nearest the previous detected subject; this is NOT identity tracking,
speaker detection, or a promise to find faces. Missing detections are
interpolated, and insufficient detections fall back to centered framing.
"""
import math
from pathlib import Path

def path_from_samples(samples, duration):
    valid = sorted((float(t), max(0., min(1., float(x)))) for t,x in samples
                   if math.isfinite(t) and math.isfinite(x) and 0 <= t <= duration)
    unique = dict(valid)
    if len(unique) < 2 or duration <= 0:
        return []
    # Piecewise linear motion after mild three-point smoothing; endpoints
    # retained so the early and late framing still follows the subject.
    points = sorted(unique.items())
    smoothed = [points[0]]
    for i in range(1,len(points)-1):
        t,x = points[i]
        smoothed.append((t, .15*points[i-1][1]+.7*x+.15*points[i+1][1]))
    smoothed.append(points[-1])
    result = [(round(t,3),round(x,5)) for t,x in smoothed]
    if result[0][0] > 0:
        result.insert(0,(0.,result[0][1]))
    if result[-1][0] < duration:
        result.append((round(duration,3),result[-1][1]))
    return result

def sample_faces(source: Path, start, end):
    import cv2
    duration = end-start
    if duration <= 0:
        return []
    cam = cv2.VideoCapture(str(source))
    try:
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if not cam.isOpened() or cascade.empty():
            return []
        n = min(61,max(3,math.ceil(duration)+1))
        samples = []
        previous = None
        for i in range(n):
            t = min(max(0,duration-.08),duration*i/(n-1))
            cam.set(cv2.CAP_PROP_POS_MSEC,(start+t)*1000)
            ok, frame = cam.read()
            if not ok or frame is None:
                continue
            h,w = frame.shape[:2]
            if w < 32 or h < 32:
                continue
            if w > 640:
                frame = cv2.resize(frame,(640,max(1,round(h*640/w))))
            h,w = frame.shape[:2]
            gray = cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray,scaleFactor=1.08,minNeighbors=4,
                        minSize=(max(20,w//25),max(20,h//25)))
            if len(faces)==0:
                continue
            if previous is None:
                face = max(faces,key=lambda f:f[2]*f[3])
            else:
                face = min(faces,key=lambda f:abs((f[0]+f[2]/2)/w-previous))
            x = float(face[0]+face[2]/2)/w
            previous = x
            samples.append((t,x))
        return samples
    finally:
        cam.release()

def crop_filter(points):
    """FFmpeg crop expression in actual scaled frame coordinates.

    Explicit clamp avoids out-of-range crop offsets with rounding and
    changing input sizes. The caller resets PTS to the clip start.
    """
    if not points:
        return "crop=720:1280"
    ordered = sorted((float(t),float(x)) for t,x in points)
    if any(not math.isfinite(t) or not math.isfinite(x) or t<0 or not 0<=x<=1
           for t,x in ordered):
        raise ValueError("Invalid crop path")
    expr = f"{ordered[-1][1]:.6f}"
    for (a,x),(b,y) in reversed(list(zip(ordered,ordered[1:]))):
        if b <= a:
            continue
        linear = f"({x:.6f}+({y-x:.6f})*max(0,min(1,(t-{a:.3f})/{b-a:.3f})))"
        expr = f"if(lt(t,{b:.3f}),{linear},{expr})"
    return "crop=720:1280:x='max(0,min(iw-ow,iw*("+expr+")-ow/2))':y='(ih-oh)/2'"
