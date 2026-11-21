"""Conservative silence removal, with a shared edited timeline for A/V and captions."""
from __future__ import annotations
from dataclasses import replace
import math
import re
import subprocess

def normalize_pacing(value):
    value=(value or "original").strip().lower()
    if value not in ("original","tight"):
        raise ValueError("Pacing must be original or tight.")
    return value

def silence_intervals(log, duration):
    starts=[]
    result=[]
    for match in re.finditer(r"silence_(start|end):\s*(-?\d+(?:\.\d+)?)",log):
        kind,value=match.groups()
        value=max(0,min(duration,float(value)))
        if kind=="start":
            starts=[value]
        elif starts:
            if value>starts[0]:
                result.append((starts[0],value))
            starts=[]
    if starts and duration>starts[0]:
        result.append((starts[0],duration))
    return result

def detect_silences(source, start, end):
    proc=subprocess.run(["ffmpeg","-nostdin","-hide_banner","-ss",str(start),
        "-i",str(source),"-t",str(end-start),"-vn","-af",
        "silencedetect=noise=-35dB:d=0.8","-f","null","-"],
        capture_output=True,text=True,timeout=120)
    if proc.returncode:
        return []
    return silence_intervals(proc.stderr,end-start)

def keep_intervals(duration, silences, protected, min_length):
    """Preserve recognized speech, 180ms of context at each silence edge,
    at least min_length seconds, and limit jump cuts to eight per clip.
    All times are relative to the untrimmed clip."""
    if not protected or duration<=min_length:
        return [(0.,duration)]
    budget=min(duration-min_length,duration*.35)
    removed=[]
    for start,end in sorted(silences):
        if len(removed)>=8 or budget<.4:
            break
        a=max(0, start+.18)
        b=min(duration,end-.18)
        if b-a<.4:
            continue
        parts=[(a,b)]
        for x,y in protected:
            x-=.12
            y+=.12
            parts=[p for l,r in parts for p in (
                [(l,r)] if y<=l or x>=r else
                [(l,min(x,r)),(max(y,l),r)]) if p[1]-p[0]>=.4]
        for l,r in parts:
            if len(removed)>=8 or budget<.4:
                break
            l=round(l,3)
            r=round(min(r,l+budget),3)
            if r-l>=.4:
                removed.append((l,r))
                budget-=r-l
    keep=[]
    cursor=0.
    for a,b in sorted(removed):
        if a>cursor:
            keep.append((cursor,a))
        cursor=max(cursor,b)
    if cursor<duration:
        keep.append((cursor,duration))
    return keep or [(0.,duration)]

def map_time(t, keep):
    cursor=0.
    for a,b in keep:
        if t<=a:
            return cursor
        if t<=b:
            return cursor+t-a
        cursor+=b-a
    return cursor

def remap_speech(segments, start, duration, keep):
    """Use the same time mapping as the media edit; never rewrite speech."""
    output=[]
    for seg in segments:
        a=max(0.,seg.start-start)
        b=min(duration,seg.end-start)
        if b<=a:
            continue
        left,right=map_time(a,keep),map_time(b,keep)
        if right<=left:
            continue
        words=[]
        for x,y,t in getattr(seg,"words",()):
            x=max(0.,x-start)
            y=min(duration,y-start)
            if y>x:
                p,q=map_time(x,keep),map_time(y,keep)
                if q>p:
                    words.append((p,q,t))
        output.append(replace(seg,start=left,end=right,words=tuple(words)))
    return output

def trim_media(source,target,keep,start):
    """Apply identical retained intervals to decoded video and audio before
    cropping or composing subtitles. Conservative fixed re-encode."""
    filters=[]
    for i,(a,b) in enumerate(keep):
        lo,hi=start+a,start+b
        filters.extend([
            f"[0:v:0]trim=start={lo:.6f}:end={hi:.6f},setpts=PTS-STARTPTS[v{i}]",
            f"[0:a:0]atrim=start={lo:.6f}:end={hi:.6f},asetpts=PTS-STARTPTS[a{i}]"])
    filters.append("".join(f"[v{i}][a{i}]" for i in range(len(keep)))+
                   f"concat=n={len(keep)}:v=1:a=1[v][a]")
    subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-i",str(source),
        "-filter_complex_threads","1","-filter_complex",";".join(filters),
        "-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","18",
        "-pix_fmt","yuv420p","-c:a","aac","-b:a","160k",str(target)],
        capture_output=True,check=True,timeout=600)
