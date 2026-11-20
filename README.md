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

### Optional — GitHub Pages visual dashboard

The GitHub-only source also includes `index.html`, `styles.css`, `app.js` and a Pages deployment workflow. The Page is **not yet deployed**, because the GitHub integration does not have permission to enable Pages for the repository.

To optionally enable GitHub Pages yourself:
1. Open [repository Settings → Pages](https://github.com/addachai03-stack/index.html-/settings/pages) on your signed-in GitHub account.
2. Select **Build and deployment → Source → GitHub Actions**.
3. Open [Deploy Mobile Studio workflow](https://github.com/addachai03-stack/index.html-/actions/workflows/pages.yml) and tap **Run workflow**.
4. Only after a successful deployment, use the GitHub Pages URL shown in the job result. This optional website is still hosted exclusively on GitHub—no Apper.

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
