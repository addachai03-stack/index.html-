"""CutNova premium creative tools.

No claims of actual trending/viral data: rankings are content-derived heuristics.
All hooks and captions remain grounded in a source video's recognized speech.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from hook_rank import cue_count, strongest_phrase

STYLES = ("engagement", "funny", "facts", "story")

CUES = {
    "engagement": (
        "secret", "surprise", "reveal", "truth", "real", "amazing", "crazy",
        "shocking", "unbelievable", "why", "what", "who", "wait", "look",
        "asli", "raaz", "kya", "dekho", "kaun", "sach", "असली",
        "सच", "राज", "क्या", "कौन", "देखो",
    ),
    "funny": (
        "haha", "laugh", "funny", "lol", "hilarious", "joke", "prank",
        "comedy", "reaction", "oops", "awkward", "hahaha",
        "hasi", "majak", "mazak", "masti", "hasna", "joke", "हंसी", "मजाक",
        "हाहा", "कॉमेडी",
    ),
    "facts": (
        "because", "means", "first", "second", "how", "learn", "fact",
        "example", "science", "reason", "explain", "actually", "did you know",
        "kaise", "kyun", "matlab", "pata", "जानकारी", "क्यों", "कैसे",
        "मतलब", "पता", "जानते",
    ),
    "story": (
        "then", "suddenly", "but", "however", "finally", "after",
        "before", "next", "mystery", "twist", "unexpected",
        "phir", "lekin", "tab", "akhir", "फिर", "लेकिन",
        "अचानक", "आखिर", "कहानी",
    ),
}

MODE_HEADLINES = {
    "engagement": "Best reveal",
    "funny": "Funny moment",
    "facts": "Interesting fact",
    "story": "Story moment",
}

MODE_CTA = {
    "engagement": "Which part surprised you most?",
    "funny": "Which part made you laugh?",
    "facts": "What did you learn from this clip?",
    "story": "What do you think happens next?",
}


def normalize_style(style: str) -> str:
    value = (style or "engagement").strip().lower()
    if value not in STYLES:
        raise ValueError("Highlight style must be engagement, funny, facts or story.")
    return value


def highlight_bonus(transcript: str, style: str = "engagement") -> float:
    """A small, capped boost to an existing speech/scene ranking.

    This measures textual cues only and is NOT a social-trending metric.
    """
    style = normalize_style(style)
    txt = (transcript or "").lower()
    if not txt:
        return 0.0
    hits = cue_count(txt, CUES[style])
    question = 0.03 if "?" in txt or "？" in txt else 0
    return min(0.18, hits * 0.042 + question)


def text_fragments(text: str, max_chars: int = 42, max_words: int = 8) -> list[str]:
    """Break ASR speech into compact subtitle blocks; never silently discard words."""
    words = re.sub(r"\s+", " ", text or "").strip().split()
    if not words:
        return []
    pieces: list[str] = []
    acc: list[str] = []
    for token in words:
        # Split unusually long unspaced ASR tokens without dropping them.
        tokens = [token[i:i+max_chars] for i in range(0, len(token), max_chars)]
        for t in tokens:
            proposed = " ".join(acc + [t])
            if acc and (len(proposed) > max_chars or len(acc) >= max_words):
                pieces.append(" ".join(acc))
                acc = []
            acc.append(t)
    if acc:
        pieces.append(" ".join(acc))
    return pieces


def distribute_subtitles(
    speech_start: float,
    speech_end: float,
    text: str,
    clip_start: float,
    clip_end: float,
    max_chars: int = 42,
) -> list[tuple[float, float, str]]:
    """Approximate word-based subtitle timing within an ASR segment.

    Segment timestamps are real ASR timestamps. Sub-fragment timings are
    proportional estimates, not forced-aligned word timestamps.
    """
    start = max(0.0, float(speech_start), float(clip_start))
    end = min(float(speech_end), float(clip_end))
    if end <= start:
        return []
    fragments = text_fragments(text, max_chars=max_chars)
    if not fragments:
        return []
    total = sum(max(1, len(s)) for s in fragments)
    cursor = start
    result = []
    for idx, phrase in enumerate(fragments):
        piece_end = end if idx == len(fragments) - 1 else start + (end-start)*(
            sum(max(1, len(s)) for s in fragments[:idx + 1]) / total
        )
        piece_end = max(cursor, min(end, piece_end))
        if piece_end - cursor >= 0.08:
            result.append((round(cursor-clip_start, 3), round(piece_end-clip_start, 3), phrase))
        cursor = piece_end
    return result


def choose_title(transcript: str, style: str = "engagement", index: int = 1) -> str:
    """Build a conservative title from source speech, without inventing claims."""
    normalize_style(style)
    cleaned = re.sub(r"\s+", " ", transcript or "").strip()
    if not cleaned:
        return "Short #" + str(index) + " | " + MODE_HEADLINES[style]
    phrase = strongest_phrase(cleaned, CUES[style])
    return phrase.strip(" ,.:;-") or ("Short #" + str(index))


def create_creator_pack(
    cuts: list,
    directory: Path,
    style: str,
    source_url: str,
) -> tuple[Path, Path]:
    """Export a Markdown & CSV planning pack from selected (actual) cuts."""
    mode = normalize_style(style)
    directory.mkdir(parents=True, exist_ok=True)
    rows = []
    text = [
        "# CutNova — Shorts Creator Pack",
        "",
        "Source: " + source_url,
        "Highlight mode: " + mode,
        "",
        "> AI-assisted speech and scene heuristics, NOT live social trends or guaranteed viral content.",
        "> Hook/title text is based on source ASR. Check accuracy, rights and final edits before posting.",
        "",
    ]
    for number, cut in enumerate(cuts, 1):
        title = choose_title(cut.transcript, mode, number)
        hook = strongest_phrase(cut.transcript) if cut.transcript.strip() else title
        hook = hook or title
        cta = MODE_CTA[mode]
        # These tags are a generic starting point, not claimed live-trending tags.
        tags = "#Shorts #Reels #VideoHighlights #ContentCreator #CutNova"
        caption = (hook + "\n\n" if cut.transcript else "") + cta + "\n" + tags
        row = {
            "clip": number,
            "start_seconds": round(cut.start, 2),
            "end_seconds": round(cut.end, 2),
            "length_seconds": round(cut.end - cut.start, 2),
            "score": round(cut.score, 4),
            "style": mode,
            "title": title,
            "hook": hook,
            "caption": caption,
            "hashtags": tags,
            "ranking_reason": cut.reason,
            "source_speech_detected": bool(cut.transcript.strip()),
        }
        rows.append(row)
        text.extend([
            "## Short " + str(number) + " — " + title,
            "",
            "- Cut: " + str(row["start_seconds"]) + "s → " + str(row["end_seconds"]) + "s",
            "- AI-assisted ranking: " + str(row["score"]) + " (" + row["ranking_reason"] + ")",
            "- Proposed hook: " + hook,
            "- Generic caption CTA: " + cta,
            "- Suggested hashtags: " + tags,
            "- Recognized speech: " + ("Yes" if row["source_speech_detected"] else "No — review visuals manually"),
            "",
        ])
    guide = directory / "Posting_Guide.md"
    guide.write_text("\n".join(text), encoding="utf-8")
    csvfile = directory / "Shorts_Plan.csv"
    if rows:
        with csvfile.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows({k: (chr(39)+v if isinstance(v,str) and v.lstrip().startswith(("=", "+", "-", "@")) else v) for k,v in row.items()} for row in rows)
    else:
        csvfile.write_text("", encoding="utf-8")
    return guide, csvfile
