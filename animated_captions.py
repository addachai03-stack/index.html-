"""Burn-in spoken-word highlights with ASS subtitle events.

ASR word boundaries are retained when available. If only segment times
exist, use evenly spaced word estimates and report the fallback explicitly.
No user/ASR text is interpreted as ASS formatting.
"""
import math
from roman_captions import caption_text

HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Spoken,Noto Sans,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,38,38,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def safe_text(text):
    return " ".join(str(text).replace("\\", "＼").replace("{", "｛")
                    .replace("}", "｝").split())


def ass_time(cs):
    hours, rem = divmod(cs, 360000)
    minutes, rem = divmod(rem, 6000)
    seconds, frac = divmod(rem, 100)
    return f"{hours}:{minutes:02d}:{seconds:02d}.{frac:02d}"


def word_events(segment):
    words = getattr(segment, "words", ())
    if words:
        return [(float(a), float(b), str(t)) for a, b, t in words], "asr_words"
    tokens = segment.text.split()
    if not tokens or segment.end <= segment.start:
        return [], "estimated"
    step = (segment.end - segment.start) / len(tokens)
    return [(segment.start + i*step, segment.start + (i+1)*step, t)
            for i,t in enumerate(tokens)], "estimated"


def write_animated(cut, segments, target, script="original"):
    """Return counts of rendered active-word events, separated by timing source."""
    counts = {"asr_words": 0, "estimated": 0}
    events = []
    cursor = 0
    for segment in sorted(segments, key=lambda s: s.start):
        words, timing = word_events(segment)
        # Avoid displaying words outside the clip. Keep the entire short phrase
        # visible while highlighting the active spoken word in yellow.
        visible = [(a,b,safe_text(caption_text(t, script))) for a,b,t in words
                   if math.isfinite(a) and math.isfinite(b)
                   and b > a and b > cut.start and a < cut.end]
        visible = [(a,b,t) for a,b,t in visible if t]
        # Fit phrases using up to four displayed words per event group.
        for offset in range(0, len(visible), 4):
            group = visible[offset:offset+4]
            for index,(start,stop,_) in enumerate(group):
                a = max(cursor, 0, round((max(start,cut.start)-cut.start)*100))
                b = min(round((cut.end-cut.start)*100),
                        round((min(stop,cut.end)-cut.start)*100))
                if b <= a:
                    continue
                text = " ".join((r"{\c&H00EBFF&}" + t + r"{\c&HFFFFFF&}"
                                 if j == index else t)
                                for j,(_,_,t) in enumerate(group))
                events.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Spoken,,0,0,0,,{text}")
                counts[timing] += 1
                cursor = b
    if events:
        target.write_text(HEADER + "\n".join(events) + "\n", encoding="utf-8")
    return counts
