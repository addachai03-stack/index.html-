"""Transparent multilingual content cues, not predictions of viral reach."""
from bisect import bisect_right
import re
import unicodedata

HOOKS = (
    "did you know", "what if", "the reason", "you won't believe", "secret",
    "reveal", "why", "how", "truth", "actually", "watch", "listen",
    "kya aap", "kya tum", "kya", "kaise", "kyun", "raaz", "asli", "sach",
    "क्या आप", "क्या तुम", "क्या", "कैसे", "क्यों", "राज़", "राज", "असली",
    "सच", "जानते हैं", "ध्यान", "देखो", "अचानक",
)

def tokens(text):
    # Keep Hindi combining signs with letters. Python's ordinary \w can
    # split Hindi vowel marks, inflating density and breaking cue matching.
    out=[]
    word=[]
    for c in unicodedata.normalize("NFC",str(text)).casefold():
        if unicodedata.category(c)[0] in "LMN":
            word.append(c)
        elif word:
            out.append("".join(word))
            word=[]
    if word:
        out.append("".join(word))
    return out

def cue_count(text,cues=HOOKS):
    words=" "+" ".join(tokens(text))+" "
    matches={" ".join(tokens(cue)) for cue in cues}
    return sum(bool(cue and " "+cue+" " in words) for cue in matches)

def hook_strength(text):
    words=tokens(text)
    if not words:
        return 0.
    return min(1., .32*cue_count(text)+(.30 if any(c in text for c in "?？") else 0.))

def bounded_phrase(text, limit=72, max_words=11):
    result=[]
    for word in str(text).split():
        if len(result)>=max_words or len(" ".join(result+[word]))>limit:
            break
        result.append(word)
    return " ".join(result).strip(" ,.:;-")

def strongest_phrase(text, cues=HOOKS):
    """Return a verbatim phrase from the transcript, never generated facts."""
    chunks=re.split(r"(?<=[.!?।！？])\s+", str(text).strip())
    choices=[]
    for i,chunk in enumerate(chunks):
        words=chunk.split()
        # Long uninterrupted ASR transcripts: inspect bounded word windows.
        for j in range(0,len(words),9):
            phrase=bounded_phrase(" ".join(words[j:j+11]))
            if phrase:
                score=cue_count(phrase,cues)+(.5 if "?" in phrase else 0)
                choices.append((score,-i,-j,phrase))
    return max(choices)[-1] if choices else ""

def speech_coverage(intervals,start,end):
    ranges=sorted((max(start,a),min(end,b)) for a,b in intervals if b>start and a<end)
    total=0.
    cursor=start
    for a,b in ranges:
        if b>max(a,cursor):
            total+=b-max(a,cursor)
        cursor=max(cursor,b)
    return min(1.,total/max(1.,end-start))

def opening_strength(segments,start,end):
    stop=min(end,start+6)
    text=" ".join(s.text for s in segments if s.start<stop and s.end>start)
    return hook_strength(text)

def best_nonoverlap(windows, requested):
    """Exact count-aware weighted interval selection; no fixed early-only fallback."""
    ordered=sorted(windows,key=lambda c:(c.end,c.start))
    ends=[c.end for c in ordered]
    prev=[bisect_right(ends,c.start,0,i) for i,c in enumerate(ordered)]
    n=len(ordered)
    # maximize score for each exact clip count; ties keep earlier choices.
    dp=[[float("-inf")]*(n+1) for _ in range(requested+1)]
    take=[[False]*(n+1) for _ in range(requested+1)]
    dp[0]=[0.]*(n+1)
    for k in range(1,requested+1):
        for i,cut in enumerate(ordered,1):
            skip=dp[k][i-1]
            yes=dp[k-1][prev[i-1]]+cut.score
            if yes>skip+1e-10:
                dp[k][i]=yes
                take[k][i]=True
            else:
                dp[k][i]=skip
    k=max(k for k in range(requested+1) if dp[k][n]!=float("-inf"))
    result=[]
    i=n
    while k and i:
        if take[k][i]:
            result.append(ordered[i-1])
            i=prev[i-1]
            k-=1
        else:
            i-=1
    return sorted(result,key=lambda c:c.start)
