"""Speech-language and compact word-accurate subtitle helpers.

Supports Hindi, English and automatic detection. Word timestamps come from
faster-whisper when available; fallback remains segment-level estimates.
"""
from __future__ import annotations

from typing import Iterable
from pathlib import Path
import array
import math
import sys
import wave


def has_audible_speech_candidate(path: Path, minimum_rms: float = 100) -> bool:
    """Basic signal activity gate for a retry without VAD; not speech detection.

    Audio must have enough amplitude to justify another ASR attempt. Quiet
    tracks without a voice may still pass and are not considered confirmed speech.
    """
    try:
        with wave.open(str(path), "rb") as wav:
            if wav.getsampwidth() != 2 or wav.getnchannels() != 1:
                return False
            samples = wav.readframes(min(wav.getnframes(), wav.getframerate() * 25))
        pcm = array.array("h")
        pcm.frombytes(samples[:len(samples) // 2 * 2])
        if sys.byteorder != "little":
            pcm.byteswap()
        if not pcm:
            return False
        rms = math.sqrt(sum(int(x) ** 2 for x in pcm) / len(pcm))
        return rms >= minimum_rms
    except (OSError, EOFError, ValueError, wave.Error):
        return False

LANGUAGES = ("auto", "hi", "en")


def normalize_language(language: str) -> str:
    language = (language or "auto").strip().lower()
    if language not in LANGUAGES:
        raise ValueError("Speech language must be auto, hi or en.")
    return language


def whisper_settings(language: str) -> tuple[str, str | None]:
    """Prefer a stronger multilingual CPU ASR for Hindi speech and Devanagari."""
    chosen = normalize_language(language)
    model = "small" if chosen == "hi" else "tiny"
    hint = None if chosen == "auto" else chosen
    return model, hint


def group_word_timings(words: Iterable, *, max_chars: int = 32,
                       max_words: int = 7, max_gap: float = 0.75, word_groups: list | None = None
                       ) -> list[tuple[float, float, str]]:
    """Group exact ASR word timestamps into ~1–2-line short caption phrases.

    Accept faster-whisper Word objects with start/end/word fields. Reject
    unusable times, do not create words or alter recognized spelling. A
    phrase's first/last word provide its real timing, not proportional timing.
    """
    grouped: list[tuple[float, float, str]] = []
    current: list[str] = []
    timings: list[tuple[float, float, str]] = []
    start = 0.0
    stop = 0.0

    def flush():
        nonlocal current, timings
        if current and stop > start:
            grouped.append((round(start, 3), round(stop, 3), " ".join(current)))
            if word_groups is not None:
                word_groups.append(tuple(timings))
        current = []
        timings = []

    for word in words:
        try:
            begin, finish = float(word.start), float(word.end)
            token = str(word.word or "").strip()
        except (ValueError, AttributeError, TypeError):
            continue
        if not token or not (0 <= begin < finish):
            continue
        # Most Whisper words are short; split long unicode tokens only as a last
        # resort in the downstream text_fragments() without inventing text.
        if current and (
            len(" ".join(current + [token])) > max_chars or
            len(current) >= max_words or
            begin - stop > max_gap
        ):
            flush()
        if not current:
            start = begin
        current.append(token)
        timings.append((begin, finish, token))
        stop = finish
    flush()
    return grouped
