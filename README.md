# CutNova — URL to Shorts Studio

Phone-first, GitHub-hosted source for an AI-assisted long-video to Shorts workflow. The **GitHub Actions render engine** accepts a public video URL (YouTube/Instagram where permitted and technically accessible, or direct video links), selects approximately 15–60-second highlight candidates using speech and visual scoring, formats 9:16 portrait clips, burns in optional speech captions, and publishes a downloadable ZIP workflow artifact. It does not guarantee viral performance.

> **Status:** Source repository and GitHub Actions prototype. The front-end is a mobile-friendly project dashboard but cannot start an authenticated GitHub Action or render a social-video URL by itself. You must run the Action from GitHub (no access token should be pasted into the browser). Video extraction can fail if platforms block downloads, restrict content, or require authentication; no DRM, paywall, private-content, login, or anti-bot bypass is attempted.

## iPhone workflow (no computer)

1. Open [Shorts Generator GitHub Action](./actions/workflows/shorts.yml).
2. In **Actions → CutNova — Generate Shorts → Run workflow**, paste the public long-video URL.
3. Enter number of clips (default 6), clip duration (15–60 seconds), and confirm you own or are authorized to edit the video.
4. Open the completed workflow run and download **cutnova-shorts-...** under Artifacts. If the source is inaccessible, check the Action log and its report artifact.
5. Unzip and review MP4s and timing/caption files on iPhone before posting. File contents and video processing are not private on public GitHub Actions runners. Avoid private footage and sensitive URLs.

## What is actually done

- URL validation and domain allowlist with defense against SSRF, private addresses, localhost and userinfo links.
- Transcript-based engagement heuristics plus scene transitions; alternative visual ranking if audio/transcription is unavailable.
- FFmpeg portrait 720×1280 H.264/AAC output with subtitles, SRT file, previews, JSON manifest and ZIP archive.
- Unit tests and public GitHub Action workflow.
- iPhone-friendly static project dashboard; it links to the authenticated GitHub Action rather than storing a PAT.

## Constraints

- Content rights are your responsibility. Use videos you own or have permission to adapt and respect platform terms.
- Platform download is best-effort and may be blocked. No cookies or private access are supported.
- Whisper CPU inference and FFmpeg exports may take time; GitHub Actions quotas and repository settings apply.
- The selection is **heuristic AI-assisted**, not a real-world trending/viral guarantee.
- This is not an always-on SaaS server. Fully automated one-tap URL to clips in a hosted UI requires a real backend with authenticated queue/storage, which is not configured here.

## Development / tests

```bash
python -m unittest discover -s tests -v
pip install -r requirements.txt
python studio.py --url "https://example.com/own-video.mp4" --clips 3 --min-seconds 15 --max-seconds 60 --rights-confirmed
```

Requirements for rendering: **ffmpeg**, **ffprobe** (with libx264, AAC, and libass), Python 3.11+, and internet connection. No secret keys are embedded.

## Design

Built for free-first, Hinglish-speaking, phone-only creators. Each Short includes a candidate timestamp, proposed short title/hook, caption (.srt), and real MP4 when the source is downloadable and decodable.

## License and safety

MIT-licensed app code; third-party video copyright remains with its respective owner. No redistribution rights are implied.
