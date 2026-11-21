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


STOPWORDS = frozenset("""
a an the and or but to for from in on at of is are was were this that these those it its
i me my you your we they he she them their have has had be been with as by not do does did
how what why when where who which can will would could should just more very really thing things
video clip shorts short today here there about then than into over out some any also so like
aap tum tumhe main mai mein mera meri ham hum hai hain ho tha thi the ye yeh yahan wo woh
kya kaise kyun kyu kaun kab kaha aur lekin phir ab ek ki ka ke ko se me ne bhi tak jo
है हैं था थी थे और ये यह वह वो को की के का से में भी एक अब तो फिर जो कैसे क्यों
क्या कौन कब कहाँ हैं नहीं बस आप हम तुम इस उस ये करते कर रहा रही रहे कुछ
""".split())

TOPIC_LABELS = {
    "engagement": "#Interesting", "funny": "#FunnyMoments",
    "facts": "#DidYouKnow", "story": "#StoryTime",
}
HOOK_OPENERS = {
    "engagement": "Watch this part",
    "funny": "This moment",
    "facts": "Listen to this explanation",
    "story": "Here's the moment",
}


def topic_words(speech: str, limit: int = 4) -> list[str]:
    """Extract transcript-grounded keywords across English, Hindi and Hinglish."""
    from collections import Counter
    from hook_rank import tokens as multilingual_tokens
    seq = [w for w in multilingual_tokens(speech or "")
           if len(w) >= 3 and w not in STOPWORDS and not w.isdigit()]
    counts = Counter(seq)
    # Word count plus its first occurrence is deterministic. No trend data.
    first = {w: seq.index(w) for w in counts}
    return sorted(counts, key=lambda w: (-counts[w], first[w], w))[:limit]


def topic_hashtags(speech: str, style: str) -> str:
    import unicodedata
    mode = normalize_style(style)
    fixed = ["#Shorts", "#Reels", TOPIC_LABELS[mode]]
    for word in topic_words(speech):
        chars = "".join(c for c in word if unicodedata.category(c)[0] in "LMN")
        if len(chars) >= 3:
            tag = "#" + chars[:30]
            if tag.lower() not in {t.lower() for t in fixed}:
                fixed.append(tag)
        if len(fixed) >= 6:
            break
    # Empty ASR must not pretend to know the topic.
    return " ".join(fixed)


def source_description(speech: str, style: str, limit: int = 225) -> str:
    """Describe only actual recognized speech; no fabricated visual events."""
    normalize_style(style)
    line = re.sub(r"\s+", " ", speech or "").strip()
    if not line:
        return "Visual highlight. Review the footage and add an accurate description before publishing."
    words = line.split()
    summary = " ".join(words[:min(38, len(words))])
    if len(summary) > limit:
        summary = summary[:limit].rsplit(" ", 1)[0]
    return "In this clip: " + summary + ("…" if len(summary) < len(line) else "")


def creator_hook_options(speech: str, style: str, index: int) -> list[str]:
    """Three reviewable hook ideas based on the same ASR source phrase."""
    mode = normalize_style(style)
    if not speech.strip():
        return ["Visual moment #" + str(index) + " — add a verified hook"]
    title = choose_title(speech, mode, index)
    is_hindi = any("\\u0900" <= c <= "\\u097f" for c in title)
    if is_hindi:
        frames = ["ये सुनिए", "यह बात ध्यान से सुनिए", "आपने ये सुना"]
    elif mode == "facts":
        frames = ["Listen to this explanation", "Did you catch this", "The key point"]
    elif mode == "story":
        frames = ["Here's the moment", "What happens next", "Listen to this part"]
    elif mode == "funny":
        frames = ["Watch this moment", "Don't miss this part", "This line"]
    else:
        frames = ["Watch this part", "Did you catch this", "Listen closely"]
    return [frame + ": " + title for frame in frames]


def creator_hook(speech: str, style: str, index: int) -> str:
    return creator_hook_options(speech, style, index)[0]


def build_creator_records(cuts: list, style: str, source_url: str) -> list[dict]:
    """Propose copy from ASR; ranking is heuristic, not virality prediction."""
    mode = normalize_style(style)
    rows = []
    for number, cut in enumerate(cuts, 1):
        speech = re.sub(r"\s+", " ", cut.transcript or "").strip()
        title = choose_title(speech, mode, number)
        hooks = creator_hook_options(speech, mode, number)
        hook = hooks[0]
        description = source_description(speech, mode)
        hashtags = topic_hashtags(speech, mode)
        cta = MODE_CTA[mode] if speech else "Add your own verified context before posting."
        caption = hook + "\n\n" + cta + "\n\n" + hashtags
        rows.append({
            "clip": number,
            "start_seconds": round(cut.start, 2),
            "end_seconds": round(cut.end, 2),
            "length_seconds": round(cut.end-cut.start, 2),
            "score": round(cut.score, 4),
            "style": mode,
            "title": title,
            "hook": hook,
            "hook_options": hooks,
            "caption": caption,
            "description": description,
            "hashtags": hashtags,
            "topic_keywords": ", ".join(topic_words(speech)),
            "ranking_reason": cut.reason,
            "source_speech_detected": bool(speech),
            "disclaimer": "AI-assisted suggestions; not measured trends or guaranteed viral reach.",
            "source_url": source_url,
        })
    return rows


def create_creator_pack(
    cuts: list,
    directory: Path,
    style: str,
    source_url: str,
    records: list[dict] | None = None,
) -> tuple[Path, Path]:
    """Generate content-aware hook/caption/description/hashtags per actual clip."""
    import json
    mode = normalize_style(style)
    directory.mkdir(parents=True, exist_ok=True)
    rows = records if records is not None else build_creator_records(cuts, mode, source_url)
    guide = [
        "# CutNova — AI-Assisted Shorts Creator Pack", "",
        "Source: " + source_url,
        "Highlight mode: " + mode, "",
        "> Scores are speech/scene heuristics, NOT live social trends or guaranteed viral content.",
        "> Speech-derived ideas must be reviewed; do not publish unverified claims.",
        "> No recognized speech means topic, visuals and hook must be checked manually.",
        "",
    ]
    for row in rows:
        number = row["clip"]
        guide.extend([
            "## Short " + str(number) + " — " + row["title"],
            "",
            "- Cut: " + str(row["start_seconds"]) + "s → " + str(row["end_seconds"]) + "s",
            "- AI-assisted ranking: " + str(row["score"]) + " (" + row["ranking_reason"] + ")",
            "- Proposed hook: " + row["hook"],
            "- Alternate hooks: " + " | ".join(row["hook_options"][1:]),
            "- Description: " + row["description"],
            "- Suggested hashtags: " + row["hashtags"],
            "- Recognized speech: " + ("Yes" if row["source_speech_detected"] else "No — review visuals manually"),
            "",
            "**Ready-to-edit caption:**", "",
            row["caption"], "",
        ])
        textfile = directory / ("short_" + str(number).zfill(2) + "_post.txt")
        textfile.write_text("\n".join([
            "TITLE", row["title"], "",
            "HOOK", row["hook"], "",
            "ALTERNATE HOOKS", *row["hook_options"][1:], "",
            "DESCRIPTION", row["description"], "",
            "CAPTION", row["caption"], "",
            "HASHTAGS", row["hashtags"], "",
            "TOPIC WORDS", row["topic_keywords"] or "Not identified; review footage", "",
            "DISCLAIMER", row["disclaimer"],
        ]), encoding="utf-8")
    guidefile = directory / "Posting_Guide.md"
    guidefile.write_text("\n".join(guide), encoding="utf-8")
    csvfile = directory / "Shorts_Plan.csv"
    if rows:
        with csvfile.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows({
                k: (chr(39)+v if isinstance(v,str) and v.lstrip().startswith(("=", "+", "-", "@")) else v)
                for k,v in row.items()
            } for row in rows)
    else:
        csvfile.write_text("", encoding="utf-8")
    (directory / "Creator_Pack.json").write_text(
        json.dumps({"source_url":source_url, "style":mode, "clips":rows,
                    "note":"Heuristic+ASR suggestions; review accuracy and rights before posting."},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    return guidefile, csvfile
