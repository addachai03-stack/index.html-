"""Approximate, offline Hindi-to-Roman caption transliteration (not translation).

Common words use readable Hinglish spellings; other Devanagari words use
a phonetic mapping and final schwa removal. English and punctuation survive.
This is a deterministic approximation, not a pronunciation/accuracy guarantee.
"""
import re
import unicodedata

COMMON = {
    "आप":"aap", "कैसे":"kaise", "हैं":"hain", "है":"hai", "हूँ":"hoon",
    "हूं":"hoon", "मैं":"main", "में":"mein", "यह":"yeh", "वह":"woh",
    "क्या":"kya", "क्यों":"kyun", "नहीं":"nahi", "दोस्तों":"doston",
    "नमस्ते":"namaste", "आज":"aaj", "और":"aur", "बहुत":"bahut",
    "करना":"karna", "अपने":"apne", "देखो":"dekho", "लिए":"liye",
    "वीडियो":"video", "शॉर्ट्स":"shorts", "आपका":"aapka", "हमारा":"hamara",
    "अच्छा":"achha", "बात":"baat", "पहले":"pehle", "कभी":"kabhi",
    "मुझे":"mujhe", "तुम्हें":"tumhein", "सकते":"sakte", "रहा":"raha",
    "रहे":"rahe", "रही":"rahi", "गया":"gaya", "गई":"gayi",
    "इस":"is", "उस":"us", "एक":"ek", "से":"se", "को":"ko",
    "के":"ke", "की":"ki", "का":"ka", "तो":"to", "भी":"bhi",
    "पर":"par", "था":"tha", "थे":"the", "थी":"thi", "अब":"ab",
    "सब":"sab", "कुछ":"kuch", "कैसा":"kaisa", "करते":"karte",
    "करता":"karta", "करती":"karti", "मिलता":"milta", "समझ":"samajh",
}
CONS = dict(zip("कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
    "k kh g gh ng ch chh j jh ny t th d dh n t th d dh n p ph b bh m y r l v sh sh s h".split()))
NUKTA = {"क":"q","ख":"kh","ग":"gh","ज":"z","ड":"r","ढ":"rh","फ":"f","य":"y"}
VOWELS = dict(zip("अआइईउऊऋऌएऐओऔऑऍ", "a aa i ee u oo ri li e ai o au o e".split()))
SIGNS = dict(zip("ािीुूृॄॢेैोौॉॅ", "aa i ee u oo ri ree li e ai o au o e".split()))
MARKS = {"ं":"n", "ँ":"n", "ः":"h", "ऽ":"", "\u200c":"", "\u200d":""}
DIGITS = dict(zip("०१२३४५६७८९", "0123456789"))
WORD = re.compile(r"[\u0900-\u097f\u200c\u200d]+")


def normalize_caption_script(value):
    value = (value or "original").strip().lower()
    if value not in ("original", "roman"):
        raise ValueError("Caption script must be original or roman.")
    return value


def _word(word):
    if word in COMMON:
        return COMMON[word]
    word = unicodedata.normalize("NFD", word)
    out = []
    i = 0
    while i < len(word):
        c = word[i]
        if c in CONS:
            base = CONS[c]
            i += 1
            if i < len(word) and word[i] == "़":
                base = NUKTA.get(c, base)
                i += 1
            if i < len(word) and word[i] == "्":
                out.append(base)
                i += 1
            elif i < len(word) and word[i] in SIGNS:
                out.append(base + SIGNS[word[i]])
                i += 1
            else:
                # Hindi often drops the final inherent vowel.
                out.append(base + ("a" if i < len(word) else ""))
            continue
        out.append(VOWELS.get(c, MARKS.get(c, DIGITS.get(c, {"।":".","॥":"."}.get(c,c)))))
        i += 1
    return "".join(out)


def romanize(text):
    # Keep English, numbers, spaces and punctuation intact. Separate danda
    # punctuation from words so common word spellings also work at sentence ends.
    text = text.replace("।", ".").replace("॥", ".")
    return WORD.sub(lambda m: _word(m.group()), text)


def caption_text(text, script="original"):
    return romanize(text) if normalize_caption_script(script) == "roman" else text
