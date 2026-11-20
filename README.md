# CutNova — Premium URL-to-Shorts Studio

**Actual code on GitHub, iPhone-first, Hinglish-friendly.** Paste a public long-video URL, request 1–10 highlight clips, and receive downloadable **15–60-second 9:16 MP4 Shorts** through GitHub Actions when the source video is accessible and you have rights to adapt it.

**Important:** The engine ranks moments using Whisper speech recognition, hook/topic keywords and scene changes. These scores are heuristic; they do **not** measure current social trends or guarantee virality. The UI is a static dashboard, not a service that silently downloads YouTube/Instagram content.

## Real, verified test

[Successful GitHub Actions smoke test](https://github.com/addachai03-stack/index.html-/actions/runs/44751751673): a royalty-free 30-second direct MP4 URL generated a **15.0-second 720×1280 H.264/AAC MP4**. Output inspected independently with FFprobe. The sample did not yield speech captions; none were fabricated.

## Use it from an iPhone (no laptop)

### Option A — URL → GitHub request → automatic Action

Once GitHub Pages is enabled (see setup below), open the CutNova dashboard, paste the video URL, select 3/6/10 clips and duration limits, and confirm you own or may edit the footage. Tap **GENERATE MY SHORTS**. A prefilled **public GitHub issue** opens in Safari. Tap **Submit new issue** — an owner-only GitHub Action starts automatically.

Check the issue for a result comment with a link to its Action run. Open **Artifacts**, download `cutnova-issue-...`, and unzip the real MP4 files. GitHub accounts other than the repository owner cannot run the expensive rendering workflow through Issues.

**Public issue warning:** The URL and parameters become public; do not submit secrets, private links, passwords, or personal footage.

### Option B — run directly from GitHub (works before Pages setup)

1. Open [CutNova — Generate Shorts](https://github.com/addachai03-stack/index.html-/actions/workflows/shorts.yml) on GitHub.
2. Tap **Run workflow**. Paste the long-video's **public HTTPS URL**.
3. Choose number of cuts, 15–60 second limits and affirm editing rights.
4. Run the workflow. Open its run's **Artifacts** and download the video ZIP when it completes.
5. Review all clips, cropping and automatic speech captions before posting. If the platform blocks automatic downloads, the workflow will fail with a diagnostics report rather than pretending the clip was created.

### Optional — enable the CutNova GitHub Pages mobile dashboard

GitHub's repository automation account could not create the Pages site: `Resource not accessible by integration`. **One account-owner setting is needed**:

1. Open this repository's **Settings → Pages** on GitHub.
2. Under **Build and deployment**, set **Source → GitHub Actions**.
3. Open [Deploy Mobile Studio](https://github.com/addachai03-stack/index.html-/actions/workflows/pages.yml), tap **Run workflow** and confirm the deploy finished successfully.
4. Then use the Pages URL shown in the deployment output. **Do not assume the website is live before the deployment succeeds.**

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
