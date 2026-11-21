"""Fixed, validated libass subtitle presets. No user-provided filter strings."""
STYLES = {
    "classic": "FontName=Noto Sans,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=0,MarginV=42,Alignment=2",
    "yellow": "FontName=Noto Sans,FontSize=17,Bold=1,PrimaryColour=&H0000EBFF,OutlineColour=&H00000000,Outline=3,Shadow=0,MarginV=42,Alignment=2",
    "boxed": "FontName=Noto Sans,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,BorderStyle=3,Outline=3,Shadow=0,MarginV=42,Alignment=2",
}

def normalize_caption_style(value):
    value = (value or "classic").strip().lower()
    if value not in STYLES:
        raise ValueError("Caption style must be classic, yellow or boxed.")
    return value

def subtitle_style(value="classic"):
    return STYLES[normalize_caption_style(value)]
