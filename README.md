# CutNova — Premium URL-to-Shorts Studio

**Actual code on GitHub, iPhone-first, Hinglish-friendly.** Paste a public long-video URL, request 1–10 highlight clips, and receive downloadable **15–60-second 9:16 MP4 Shorts** through GitHub Actions when the source video is accessible and you have rights to adapt it.

**Important:** The engine ranks moments using Whisper speech recognition, hook/topic keywords and scene changes. These scores are heuristic; they do **not** measure current social trends or guarantee virality. The UI is a static dashboard, not a service that silently downloads YouTube/Instagram content.

## Start now — 100% GitHub, no Apper, no external app

**[✂ Open GitHub's native CutNova URL form](https://github.com/addachai03-stack/index.html-/issues/new?template=cutnova-shorts.yml)**

On iPhone:
1. Sign in to your GitHub account and open the form above.
2. Paste a **public HTTPS long-video URL** (YouTube, Instagram or direct MP4). Choose **3 / 6 / 10** Shorts and **15–60 second** limits.
3. Tick the required confirmation that you own or may edit/republish the footage.
4. Tap **Submit new issue**. This repository only permits its **owner** to start render jobs through Issues.
5. GitHub Actions runs entirely on GitHub-hosted infrastructure, generates MP4s where the source is accessible, and posts a comment with the download run link. Open the completed run → **Artifacts** → download ZIP.
6. Review video crop, speech captions, timestamps and rights before publishing.

The issue form, code, queue (GitHub Issues), renderer (GitHub Actions), logs, and downloadable artifacts all reside on GitHub. GitHub Pages is an **optional** front-end and is *not* necessary for producing Shorts.

GitHub Issues on this public repo show source URLs publicly. Do not paste confidential links, passwords or private videos. Some YouTube/Instagram sources are blocked; these will fail with a report rather than fake a video.

## Real, verified test

[Successful GitHub Actions smoke test](https://github.com/addachai03-stack/index.html-/actions/runs/44751751673): a royalty-free 30-second direct MP4 URL generated a **15.0-second 720×1280 H.264/AAC MP4**. Output inspected independently with FFprobe. The sample did not yield speech captions; none were fabricated.

## Another GitHub-only option: manual Actions dispatch

You can run the engine without opening an issue:
1. Open [CutNova — Generate Shorts](https://github.com/addachai03-stack/index.html-/actions/workflows/shorts.yml) on GitHub.
2. Tap **Run workflow**, paste a public video URL, choose the clip count and 15–60 second limits, confirm editing rights and start.
3. From the completed GitHub Action, open **Artifacts** and download the MP4 ZIP. If the platform blocks media access, inspect its failure report.

### Fastest LIVE preview — GitHub Pages, branch-based (no Apper)

**As of 21 Nov 2026, the GitHub repository API reports `has_pages: false`: the static site is not published.** The connected GitHub integration cannot change repository Pages settings. The website source is already in the `main` branch root (`index.html`, `styles.css`, `app.js`).

**One-time action in the repo owner's GitHub app/browser:**
1. Open [CutNova Settings → Pages](https://github.com/addachai03-stack/index.html-/settings/pages).
2. Under **Build and deployment**, choose **Source → Deploy from a branch**.
3. Set **Branch → main**, **Folder → /(root)**; press **Save**.
4. Once GitHub reports "Your site is live", visit the **Visit site** URL in Pages settings. The expected pattern is `https://addachai03-stack.github.io/index.html-/`, **but do not share it as live before GitHub confirms deployment**.

This is the fastest route because it works directly with the committed static files and needs no separate Actions dispatch. The optional `pages.yml` workflow remains available for accounts that prefer Source → GitHub Actions after Pages is already enabled.

**Important:** The static site can recognize URL formats and preview permitted videos, but real MP4 rendering requires the owner's GitHub Actions/Issues workflow; a website preview alone cannot magically fetch or convert YouTube/Instagram URLs.

### Latest verified premium smoke test (21 Nov 2026)

[GitHub-only run #44819052760](https://github.com/addachai03-stack/index.html-/actions/runs/44819052760) was triggered by the [native GitHub Issue form](https://github.com/addachai03-stack/index.html-/issues/4) using the public 30-second sample and **Funny** style. It completed successfully with:

- `short_01.mp4` — 15.0 seconds, 720×1280 H.264
- `short_02.mp4` — 15.0 seconds, 720×1280 H.264
- `Posting_Guide.md`, `Shorts_Plan.csv`, `manifest.json`, `report.json`, `CutNova_Shorts.zip`
- A GitHub bot comment linking to the downloadable artifact.

Actual MP4 files were inspected with FFprobe. The royalty-free test video yielded no detected speech, so no invented SRT captions or fabricated scene-specific claims were added. A source containing speech is still needed to verify burned-in Hindi/English subtitles end-to-end.

## Verified — Hindi speech captured from a licensed human narrator

[Successful GitHub Actions human Hindi voice proof](https://github.com/addachai03-stack/index.html-/actions/runs/44824099925) used [Wikimedia Commons — Hindi Dengue Introduction.ogg](https://commons.wikimedia.org/wiki/File:Hindi_Dengue_Introduction.ogg), by **Satyam Singh (Satyam.mgs)**, under **Creative Commons Attribution-ShareAlike 3.0**. The sample derivative includes `ATTRIBUTION.txt` and is shared under that compatible CC BY-SA license, not the CutNova code's MIT license. Audio was trimmed to a ~20-second excerpt and set over an original FFmpeg video test pattern.

Verified from the completed artifact and FFprobe, not merely claimed by job status:

- Whisper **small**, with Hindi language hint and Devanagari guidance: recognized **8 word-timed caption phrases** with **130 Devanagari codepoints**. Not perfect transcription: multiple Hindi words were misspelled, so users **must review subtitles before posting**.
- `hindi_asr_recognized.srt` contains real ASR-derived Hindi caption lines with timestamps.
- `hindi_asr_captioned_short.mp4` is **15.0 seconds, 720×1280, H.264/AAC**.
- Compared with an uncaptioned reference, lower-region subtitle pixel differences ranged **9.215–22.108** over several frames, confirming visible burned captions.
- The artifact includes MP4, SRT, `hindi_asr_report.json`, uncaptioned reference and creator attribution. GitHub artifact retention was configured for **4 days**; downloads may expire.

Earlier synthetic Hindi voice attempts failed because Whisper returned no Devanagari or sometimes rendered Urdu script. The licensed *human* Hindi proof above succeeded; **this is an integration proof, not a measured accuracy benchmark**. Natural voices/accent differences and Hinglish words still require manual QA. URL importer restrictions and center/face-aware cropping limits remain.

## New: Hindi/English speech recognition + word-aligned captions

The GitHub-only URL form now has **Speech language**:

- **Auto** (default): detect language with Whisper `tiny`.
- **Hindi**: use Whisper `small` on CPU with an explicit Hindi (`hi`) language hint and Devanagari script guidance. This may consume more GitHub Actions minutes and still requires caption review.
- **English**: use Whisper `tiny` with English (`en`) hint.

Whisper word-level timestamps, when returned, are grouped into short readable caption phrases with their actual recognized word start/end times. When a speech segment has no usable word timings, the renderer falls back to the existing approximate segment timing. This is **ASR-generated text**, so names, Hinglish, background sounds and nonstandard accents can still be wrong.

A dedicated [synthetic Hindi audio proof workflow](https://github.com/addachai03-stack/index.html-/actions/workflows/hindi-proof.yml) checks original synthesized Hindi speech → Whisper recognition → Devanagari text → caption SRT → portrait MP4. It is *not* a natural human Hindi speech benchmark. The completed run's verification report records actual results; no success is assumed before it passes.

## Verified caption + portrait smoke test (GitHub Actions)

[Successful speech-caption and smart crop proof run](https://github.com/addachai03-stack/index.html-/actions/runs/44820527736) generated a synthetic 16-second source video with a spoken voice using GitHub Actions, then independently checked:

- Whisper tiny ASR recognized **2 speech segments** (`en` detected), and exported timestamped `speech_recognized.srt` directly from recognized spoken words.
- FFmpeg rendered **15.0-second**, **720×1280**, H.264/AAC `speech_caption_short.mp4` with actual speech-derived captions **burned into the lower safe zone**.
- Independent frame-comparison test measured visible subtitle pixels (mean lower-region pixel delta **25.127**) versus the version without captions.
- A **separate manually authored** Devanagari SRT produced a valid Hindi-font subtitle video (`devanagari_font_test.mp4`; mean lower-region pixel delta **22.126**). **This is proof that Hindi glyphs render, not proof of Hindi speech recognition.**
- Smart crop used the expected **center fallback** with `face_frames: 0` on this non-human test pattern. Automatic face-positioning remains supported by code and deterministic tests, but still needs verification with a rights-cleared human-face video.

The first smoke attempt detected an incorrectly high subtitle margin (text appeared around the center). It was fixed by moving captions to a lower safe region, shortening captions to 32-character blocks and passing the final GitHub Actions test. The verification files are downloadable in that successful workflow's **Artifacts**.

## Smart portrait framing — GitHub-only next phase

The GitHub-native [CutNova Shorts form](https://github.com/addachai03-stack/index.html-/issues/new?template=cutnova-shorts.yml) now includes **Smart crop mode**:

- **Auto** (default): sample several frames within each selected Short, detect frontal faces using OpenCV's local classifier, compute a stable horizontal crop around the median detected face; fallback to centered crop when faces cannot be identified.
- **Center**: always produce a centered 9:16 crop as before.

**Scope:** this is per-clip **static face-aware re-framing**, **not continuous tracking**. It may not detect side profiles, faces inside cartoons, multiple speakers, or small/occluded faces. Each clip's `manifest.json` now records `framing.method`, `crop_x`, and the number of detected face-containing sample frames so you can verify whether face detection worked. No face model is uploaded or sent to a third party.

A separate repository-local GitHub Actions workflow also tests synthesized spoken-video transcription, timing, SRT export, FFmpeg burnt captions and a **manually supplied Hindi Devanagari font sample**. That font sample must not be confused with proof of Hindi ASR accuracy.

## Premium Shorts — new features

The native [CutNova GitHub URL form](https://github.com/addachai03-stack/index.html-/issues/new?template=cutnova-shorts.yml) now offers four selectable **content-based highlight styles**:

- **Engagement:** Hooks, questions, reveals, and surprising moments (default)
- **Funny:** Comedy, reactions, and humor-related transcript cues
- **Facts:** Explainers, reasons, and useful information
- **Story:** Story transitions, suspense, and twists

These are heuristic text/scene scores, **not real-time trend tracking** or predictions of guaranteed views. Ranking and titles cannot be accurate where the source contains no usable transcription. Short videos may produce fewer cuts than requested.

For each successful render, the GitHub Artifact and `CutNova_Shorts.zip` include:

- `short_01.mp4` etc. — actual H.264/AAC portrait MP4
- `short_01.srt` etc. — generated only if the source has recognized speech
- `Posting_Guide.md` — proposed title, grounded speech hook, generic caption CTA, hashtag suggestions and caution
- `Shorts_Plan.csv` — editable cut timings, mode, scores, notes, draft metadata
- `manifest.json` — machine-readable source and cut information

Captions are split into short lines without dropping the ASR transcript words; **sub-fragment timing is estimated** from the ASR segment bounds, and Hindi/English speech recognition may contain mistakes. The visual crop is presently center-based, not face-tracking. Review before posting.

## Features

- Mobile-focused source URL recognition and official social-video iframe preview (no video extraction or editing in the iframe)
- Owner-authenticated GitHub request and manual Actions entry points; no personal access token pasted into the website
- GitHub Runner FFmpeg install + yt-dlp public video ingestion
- CPU Whisper multilingual automatic speech detection; real ASR SRT caption export when speech is detected
- Select 1–10 non-overlapping clips, each 15–60 sec, score speech density, reveal words, and scene changes
- Center-crop 720×1280 H.264/AAC MP4, optional burned-in dialogue subtitles, manifest and ZIP
- Clear failure diagnostic if YouTube, Instagram or other services restrict media or server egress
- Unit tests, CI and one verified real 15-second export

## Limitations and safety

Only edit videos you own or have permission to transform and republish; always follow applicable platform rules. No private content, credentials, login cookies, DRM, protected streams or paywall bypass is supported. Some publicly viewable YouTube/Instagram pages still block downloads in GitHub Actions, so actual MP4 output for those URLs is **not guaranteed**. Speech recognition and crop quality require checking by a human before publishing. GitHub Actions processing, public issue submissions and video links are not suitable for confidential material. GH Actions usage quotas and available run minutes apply.

## Run locally (optional)

```sh
python -m unittest discover -s tests -v
pip install -r requirements.txt
# Requires installed ffmpeg and ffprobe
python studio.py --url "https://remotion.media/video-30s.mp4" --clips 1 --min-seconds 15 --max-seconds 15 --rights-confirmed
```

## Code

`studio.py` (transcription, ranking and portrait render); `parse_request.py` (safe issue input parser); `index.html`, `app.js`, `styles.css` (responsive URL dashboard); `.github/workflows/shorts.yml` (manual), `issue-shorts.yml` (automatic owner requests), `pages.yml` (manual Pages deployment), `checks.yml` (CI), `smoke.yml` (sample).

MIT license covers original application code, **not** third-party video or audio rights.
