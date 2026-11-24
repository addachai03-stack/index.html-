# CutNova — Premium URL-to-Shorts Studio\n
## V5.7 — Caption timeline scrubbing

The caption timeline now includes a touch-friendly seek slider plus previous/next-caption controls. Users can jump to exact caption starts, inspect silent gaps, and resume the timer preview from the selected time. The seek range derives from the last caption end time. This remains a local text timing aid, not video synchronization or rendering.

Tests: `node tests/test_caption_srt.cjs` covers seek target cue starts, gaps, and the final boundary.

## V5.6 — Private caption timeline preview

The local timed subtitle tool now offers a play/stop preview that advances a timer and displays the caption active at each timestamp. It validates the same cue set before starting, handles gaps and cue boundaries, and stops at the final end time. This is a text-only timing preview—not video playback, waveform sync, transcription or a rendered/burned-in caption track. It remains local and resets when captions are edited.

Tests: `node tests/test_caption_srt.cjs` covers active cue, gap and boundary timing.

## V5.5 — Private local timed subtitle builder

The local editor now includes a manual caption timeline helper. Enter up to 12 caption lines with start/end times (seconds) and export a standard UTF-8 SubRip (.srt) file. Lines are sorted by start time; invalid ranges, overlaps, empty captions and text over 500 characters are rejected. Generated subtitle data is held in the page and a temporary download Blob only; object URLs are revoked when edits occur or the page exits. No speech recognition, video upload, background processing or burned-in subtitle render is claimed. Import the SRT into a video editor that supports external subtitles, then preview the final export yourself.


## V4.4 — PRIVATE on-device H.264/AAC second pass (no uploads)

Under **SOCIAL VIDEO FORMAT CHECK**, local exports now offer **PREPARE PRIVATE H.264/AAC RE-ENCODE** when the current browser explicitly supports recording both codecs. This uses only the original exported browser Blob in memory. After the owner taps the button, CutNova reopens the exported file in its existing local Editor, selects the **strict H.264 + AAC** recorder mode, resets previous filters/audio overlays so they are not accidentally applied twice, and restores a valid trim. The original rights checkbox is deliberately unchecked. The user must **confirm rights and tap EXPORT SHORT again** before the second pass actually encodes anything. The app then inspects the actual MP4 output via V4.1's local sample-entry parser; a misleading H.264 claim or unsupported codec triggers a warning, not success. Local re-recording can reduce quality and requires keeping the screen awake; conversion only works when the phone both *decodes* the source and can *record* H.264/AAC.

On browsers without explicit strict AVC/AAC MediaRecorder support, the button is disabled with an honest **UNSUPPORTED ON THIS BROWSER** message. The flow does NOT silently upload private iPhone Files to GitHub, Cloudflare or third parties; it does NOT download FFmpeg.wasm, run in the background, auto-accept rights, or guarantee an Instagram upload. For any other permitted private file, users can choose it through CHOOSE VIDEO in the local editor and enable strict H.264/AAC recording themselves. The V4.3 Owner-only public URL GitHub converter remains a distinct workflow and must not be used with private footage.

Automated unit tests simulate supported, unsupported and user-cancelled cases, verify original Blob handoff with explicit rights and no network calls, and verify offline PWA availability. Mobile browser QA asserts truthful codec support gating and, when supported by the test browser, actual editor reimport with rights unchecked. Headless WebKit/Chromium results do not establish physical iPhone Safari codec support.


## V4.3 — REAL H.264/AAC social MP4 conversion (Owner-only public source)

A separate **CutNova - Owner Social MP4 Converter** is available at
`https://github.com/addachai03-stack/index.html-/actions/workflows/social-convert.yml`.
The live EDITOR has an expandable link under **SOCIAL VIDEO FORMAT CHECK**.

**What actually happens:** When the repository Owner manually starts the workflow, enters an *authorized public* direct HTTPS MP4/MOV/WebM URL (or public GitHub Issues video attachment) and explicitly checks the rights-confirmation box, GitHub Actions downloads the source using pinned TLS and public-IP checks, then uses actual FFmpeg `libx264` + `aac` encoding to produce a 720×1280 portrait MP4 with `yuv420p`, 30 fps, AAC 128 kb/s and `+faststart`. An audio-less source receives a silent AAC track. The converter refuses media over **100 MiB**, more than **65 seconds**, malformed credentials/URLs, signed query URLs, private hosts, and non-video inputs. After encoding, FFprobe validates the real video/audio streams and dimensions; only a successful job uploads `CutNova_Social_Ready_H264_AAC.mp4` plus a small JSON report as a ZIP artifact retained 7 days.

**Privacy / limits:** The manual GitHub workflow uses only an expressly submitted **public URL**. **Do not** paste secrets, signed/private video URLs, or publicly upload private iPhone Files into GitHub Issues: public GitHub Actions inputs, job history and artifacts may be visible to others. The CutNova local editor does **not** upload private Files or send a generated local Blob to this job. The GitHub account must be logged in as repository owner to use the workflow. No owner key is stored in the browser and no background render is started. Converting 9:16 H.264/AAC does not guarantee Instagram/YouTube accepts an upload. Users must review the resulting video and permissions.

**Verified automated proof:** CI `tests/test_social_convert.py` actually generates VP9+Opus video and FFmpeg converts it to H.264+AAC, then FFprobe validates the portrait result. A separate test converts an audio-less MP4 and verifies an AAC audio track was added. This validates the engine; the GitHub public-URL workflow has **not** been dispatched on an actual user video.

## V4.2 — Strict native H.264 + AAC recording request (no conversion)

The LOCAL EDITOR now offers **REQUIRE H.264 + AAC EXPORT**. This is an opt-in *recording codec request*, not a video transcoder or guarantee of social-platform acceptance. If the browser explicitly reports a supported MP4 recorder profile containing both H.264 (`avc1`) and AAC (`mp4a.40.2`), CutNova asks `MediaRecorder` to use that profile. It attempts several common AVC/AAC profile strings, including Safari-oriented alternatives, rather than relying on generic `video/mp4` (which previously yielded VP9 + Opus on automated Chromium). If none are supported, the strict-mode EXPORT SHORT button is disabled; unchecking the option restores the existing standard local export. No unknown conversion, background upload, payment, account sign-in or API key is required.

The V4.1 MP4 sample-entry inspector checks the **actual output after recording**. If the browser ignores a strict H.264/AAC request and produces a different combination, CutNova displays **STRICT SOCIAL CODEC REQUEST NOT MET**, rather than claiming the file is Instagram-ready. A basic H.264 + MP4 audio track-description match still does **not** prove AAC audio object type, bitrate, platform acceptance or a real uploaded Reel. Users can inspect, play, share or download their original file if the strict request was not honored. This phase does not implement automatic VP9/Opus-to-H.264/AAC transcoding; iPhone-only transcoding may require an additional browser-compatible encoder or an explicitly authorized conversion service.

GitHub CI tests cover explicit AVC/AAC profile selection, no fallback to generic MP4 or WebM under strict mode, and rejecting VP9/Opus or HEVC as fulfillment of an explicit AVC request. Mobile Chromium/WebKit QA checks strict UI gating and separately verifies normal local export where browser recording is supported.


## V4.1 — Actual social-video codec audit (on-device)

After a local editor export, CutNova inspects **actual ISO BMFF/MP4 track descriptions** (the `stsd` atom inside each track), rather than trusting the filename, advertised MIME, or MediaRecorder.isTypeSupported. The checker skips media-data atoms without loading them and reads only MP4 headers plus a bounded `moov` box (up to 8 MiB). It also detects a WebM file hidden under an MP4 extension. It reports the observed video/audio codec names, e.g. `VP9 + Opus`, warns when the result is not a broadly compatible H.264/AAC combination, and reports unknown or malformed containers as **NOT VERIFIED**. A basic H.264/HEVC + `mp4a` sample-entry match is **not an upload guarantee**: the audio object type, actual bitrate, frame rate, profile, edit lists and platform-specific requirements are not fully checked. No video is uploaded, converted, shared or stored.

This directly addresses the independently verified Chromium phone-sized browser export: the file was an MP4 container, but FFprobe found **VP9 video + Opus audio**, so posting compatibility cannot be assumed. Meta's Instagram Reels publishing reference lists H.264/HEVC video and AAC audio for publishing. A social upload is never attempted by the codec checker. The optional private GitHub AI renderer is separate, requires an authorized accessible public source, and is not triggered.

Unit tests cover synthetic real MP4 track structures, H.264/AAC-compatible sample entries, VP9/Opus false confidence, moov at the end, unknown codecs and spoofed WebM containers. The mobile Chromium end-to-end QA verifies the on-screen verdict against independent FFprobe decoding. Headless WebKit may lack recording support; that is not falsely counted as confirmed iPhone Safari upload compatibility.


## V4.0 — iPhone Share Sheet / Save to Files (user-initiated)

In LOCAL EDITOR, after a successful export the user can tap **SHARE / SAVE TO FILES**. CutNova sends the exact exported in-memory `File` through the native Web Share API (`navigator.canShare({files})` and `navigator.share({files})`), invoked only from a direct tap. The iOS share target is entirely user-controlled; choose **Save to Files** when it appears. No automatic transfer, sharing to other applications, upload, or background saving happens. Closing the Share Sheet does **not** prove that Files saved the video. The user can still use **DOWNLOAD SHORT**, then reselect the saved file in the V3.9 byte-for-byte verification control. When file sharing is unsupported, cancelled, or rejected, an accurate error and download fallback are shown. Audio audibility, H.264/AAC codec compatibility, iOS file persistence and social upload remain independently unverified until user-side checks.

The original export Blob is provided from the browser recorder by a local in-memory event, never via network fetching or persistent browser storage. Export reset disables the share action. The GitHub mobile browser QA tests an unsupported case and then a **mocked** `navigator.share` file transfer; this validates app behavior but is not a real iPhone OS Share Sheet. Physical Safari testing of the OS sheet is still required.


## V3.9 — Real iPhone Files round-trip verification

After exporting, CutNova offers **VERIFY IPHONE FILES DOWNLOAD**. The owner manually taps DOWNLOAD SHORT and uses iPhone Files or Share → Save to Files if necessary. Then, within the same open editor tab, the owner chooses the saved MP4/WebM in a local file picker. CutNova compares **all bytes** of the manually selected file with the current export, chunk by chunk (1 MiB chunks, max 512 MiB); files of equal length but changed content are rejected. After a match, it checks the selected file's actual browser metadata and playback progress. These checks are never automatically performed by a background service.

This check cannot access the device's Files contents without the user's explicit selection, cannot establish that Files will retain a file permanently, cannot hear/verify audible audio, and cannot certify codecs or upload success to social platforms. The current export must still be present in this browser tab. The comparator holds only the original in-memory exported Blob from the recorder, without re-fetching any `blob:` URL after download; neither the Blob nor the local URL is stored persistently. The app does not upload saved files, personal media or owner credentials. Export reset clears all previous successful verification statuses.

GitHub Actions tests cover exact byte equality, differing sizes, empty files and same-size corrupted files. Mobile Chromium checks downloaded video -> re-select actual file -> verify equality and browser playback -> mutate a byte while keeping the same size -> ensure the app reports FILE MISMATCH. WebKit browser export remains unsupported in the headless test and is not mislabeled as a verified physical iPhone save.


## V3.8 — Verify that the exported Short actually plays

The local editor now offers **VERIFY EXPORTED VIDEO PLAYBACK** after a successful render, in addition to **DOWNLOAD SHORT**. On user tap, CutNova tests the in-browser `blob:` exported video: 720×1280 metadata, finite duration of at least one second, and actual decoded playback time advancing at least 0.25 second. Failure reports `LOCAL PLAYBACK FAILED`; successful observation reports `LOCAL PLAYBACK PASS`. Neither condition verifies audible audio, specific H.264/AAC codecs, successful save in iPhone Files, or that Instagram accepts the video. These still require checking the downloaded file on the phone.

This remains local-only: the exported video and Owner Access Key are not uploaded or persisted by this check. If iPhone Safari opens a preview rather than saving automatically, use its Share → Save to Files action. Test synthetic content rather than private video when diagnosing browser capabilities. GitHub Actions exercises the real downloaded 9:16 export, starts playback and verifies the same explicit UI status in mobile Chromium; WebKit may lack `MediaRecorder` in headless automation and is honestly marked unsupported.


## V3.7 — Real local iPhone editor export test (no uploaded footage)

The EDITOR now has **PREPARE FULL EXPORT TEST VIDEO** below the 1-second device compatibility check. A user tap creates a NEW five-second original synthetic video + sine audio **inside the phone browser** (no Photos access, no GitHub/cloud upload), passes that temporary video through the same `cutnova:open-cut` event bridge as the real local editor, and requests a 0–3-second trim. This intentionally does not accept editing rights, start a render, or download automatically. The user confirms rights explicitly, taps **EXPORT SHORT**, then **DOWNLOAD SHORT** and plays the file on their device to test the complete path. Browser interruption, missing media metadata or unsupported codecs are reported as failures, not successes.

Headless mobile Chromium E2E (GitHub Actions `CutNova - Read-Only Mobile Browser QA` run 44947716484) independently verified actual source generation → editor import → portrait recording → MP4 download: 720×1280, 2.934 seconds, with audio, 171,006 bytes. Headless WebKit passed read-only UI/navigation but **did not support MediaRecorder**, so it did not pass the full export test. This is not a physical iPhone Safari test. A previously user-reported one-second native iPhone test recorded a 12 KiB MP4, but the longer real export and Files saving are still pending user-side confirmation.

Important: a valid `.mp4` container **does not prove H.264/AAC encoding or Instagram/TikTok upload compatibility**. In the automated Chromium proof, inspecting the actual MP4 revealed VP9 video + Opus audio; some platforms/devices may reject this combination. CutNova now explicitly tells users to verify downloaded file playback and social-platform acceptance, rather than promising universal MP4 support. The authorized GitHub owner AI renderer is a separate H.264/AAC-capable server route; do not assume private iPhone Files can be uploaded through it or that platform-blocked social URLs are downloadable.


## V3.3 — Verified real ZIP download status, owner-first

The **RESULTS** tab automatically inspects GitHub Actions artifact metadata for *only* a session-matched successful Owner render. It displays a verified GitHub ZIP archive link, size (binary **MiB**) and expiration. Downloads may still require GitHub sign-in. A run marked successful **does not** by itself establish that the archive exists or that the ZIP contains playable MP4s; users should inspect actual clips after downloading. Missing, expired and unavailable archives do not get fabricated download links. Artifacts expiring in the next 24 hours show an urgent but accurate warning.

Failed runs do not automatically display a rendered-media download and still offer actual workflow failure-step inspection. Untracked public jobs do not automatically fetch archives. This feature is read-only: no render dispatches or key access. No media files are stored in the user's browser by this change.

Verification: `tests/test_jobs.cjs` checks timestamp-safe artifact validity/expiry and download labels; `tests/test_results_ui.cjs` simulates GitHub's actual response paths to confirm a verified success link, no fabricated missing/expired/failed links, and no unnecessary requests for untracked runs. GitHub Actions `checks.yml` executes these tests.


## V3.1 — Owner connection verification + tracked GitHub requests

The owner rendering panel now includes **VERIFY OWNER CONNECTION · NO RENDER**. On a user click, the browser transmits the private owner key to the existing Cloudflare Worker via HTTPS `POST /verify`; the Worker compares it with `CUTNOVA_OWNER_KEY` and performs a read-only GitHub REST GET to check that the owner-only `.github/workflows/shorts.yml` is reachable and active using `CUTNOVA_GITHUB_TOKEN`. **It cannot start a video render.** The key is cleared from the browser field after each check. Neither key nor token is written to browser storage, logs, or the public repository.

For explicit `START PRIVATE AI RENDER` clicks, the browser creates a random v4 UUID (non-secret) and passes it to the Worker, which validates and forwards it as a workflow input. The workflow labels its actual run `CutNova owner <UUID>`. Upon GitHub accepting the dispatch, the UI stores **only that UUID** in the browser's tab-scoped session storage, opens RESULTS and reads GitHub's real workflow run metadata. Matching is exact by `display_title`; a delayed/missing run is reported as unlisted rather than invented progress. Closing the tab or clearing browser session data removes this tracking preference.

The authenticated connection check verifies key acceptance and GitHub read access but **not** GitHub workflow dispatch permissions, media access, successful downloads or MP4 generation. Those require a real authorized video run. YouTube/Instagram platform bot and login blocks remain outside CutNova's control. Browser/CORS provider restrictions and rights to republish remain relevant.

Testing: GitHub gateway security checks cover read-only verification, wrong-origin/key rejection, unavailable workflows, UUID validation and dispatch correlation. Owner-UI DOM simulations cover no-render key verification and authenticated render request formation. Actual owner-key verification from the user's iPhone still requires entering the saved private key in the web app; it is not present in GitHub or available to this assistant.


## V3.0 — Pre-test repair and diagnostics (21 Nov 2026)

- The iPhone **AI** tab now shows **STEP 1: PASTE PUBLIC VIDEO URL** first. The local saved-video editor is labeled **Backup** and does not pretend to run AI ranking.
- YouTube/Instagram previews clearly distinguish **browser preview only** from the **separate owner-only GitHub AI download attempt**. Site restrictions may block downloading despite a correct public URL; there is no cookie, DRM, login or bot bypass.
- **RESULTS** exposes a **WHY FAILED?** button on failed runs. It queries GitHub's public workflow job-step metadata. It does not invent a failure reason; the user can open exact logs.
- The Python renderer writes `report.json` with `failure_code` and a recovery message for recognizable platform sign-in/bot blocks, access errors, unavailable sources, and too-short media. It does not claim an MP4 when no input was downloaded.
- Cloudflare owner secrets and token remain untouched; owner-only AI workflow still needs permitted, server-accessible media. Cloudflare R2 has not been enabled in the linked account, so there is no new secure iPhone-file-to-AI-upload path. Do not promise a one-tap private upload without provisioned storage.
- Static and CI checks are not equivalent to end-to-end video rendering. **No new real video render was started for this V3.0 repair**; the requested media test follows after review.

**Known blocker:** GitHub run #1 and #2 on 21 November 2026 failed before clipping because YouTube responded **"Sign in to confirm you're not a bot"**. No legitimate code-only change can guarantee YouTube/Instagram bytes from the GitHub runner. For a permitted test, use an independently authorized, server-accessible direct HTTPS MP4. The R2H video used for preview/testing is not proof of editing/reposting rights.


## V2.9 — AI Shorts from supported public URLs (21 November 2026)

The iPhone CutNova AI tab now offers **✦ AI SHORTS FROM URL** as a separate owner-only option alongside **LOCAL CUTS**. Paste your own or authorized public YouTube, Instagram, Facebook, TikTok, Vimeo, X/Twitter, Dailymotion or direct MP4 URL. For an accessible source, the secure Cloudflare backend dispatches the owner GitHub Actions renderer. It downloads permitted public media, applies Whisper speech recognition, scores candidate windows using source speech/opening hooks/scenes, produces portrait MP4s using FFmpeg, and writes a **Creator Pack per actual clip**:

- `short_01.mp4` and subsequent rendered media, plus recognized-speech subtitles when available
- `short_01_post.txt` and subsequent post text files with clip-specific suggested title, source-grounded hook, posting caption, description and transcript-derived hashtags
- `Creator_Pack.json`, `Posting_Guide.md` and `Shorts_Plan.csv` within `CutNova_Shorts.zip`, plus actual media in the Actions artifact

Owner can request **1–10 clips**, set any integer **15–60 seconds** for min/max, or choose exact **30 seconds** by setting both minimum and maximum to 30. Requests for clips longer than source are rejected instead of silently violating the selected length. No recognized speech means a visual-review placeholder—not fabricated story claims. Copywriting is ASR-assisted and rule-based, not a live-trend-aware language model; there is no promise of virality.

This does **not** guarantee downloading every YouTube/Instagram URL. Private videos, sign-in walls, bot checks and DRM are not bypassed. The client browser alone cannot extract those social videos. The securely configured owner-only server path attempts the permitted download and gives real failure reports when blocked. Only process material you own or have permission to adapt and repost. GitHub Actions uses the repository's actual usage limits. `AI SHORTS FROM URL` opens the private owner panel; entering the saved owner key and tapping `START PRIVATE AI RENDER` dispatches the job. GitHub acceptance means *queued*, not finished. Check **RESULTS** for the actual outcome and outputs.

**Verification state:** UI/JS source checks and gateway integration tests are present; the Creator Pack Python unit tests are added in `.github/workflows/cutnova-creator-tests.yml`. No source-specific production render for this new release has yet been verified with an owner-authorized long YouTube/Instagram video. Do not describe V2.9 as universally working end-to-end until a real render is verified.


## Current release: URL check + local timed cuts (November 21, 2026)

**What works in the static web app:** Choose a video from your phone, or paste a direct publicly accessible HTTPS MP4/MOV/WebM media URL whose host permits CORS. Confirm editing rights and tap **CHECK & PREPARE CUTS**. A downloadable direct video is loaded into the device, duration is read, and CutNova prepares feasible, mostly non-overlapping **timed cut suggestions**. Tap **EDIT & EXPORT** on a suggestion to render one file at a time in a compatible browser. A 60-second video with 3 requested cuts and a 15–60s range gives 3 × 20-second suggestions; requesting 10 with a 15-second minimum gives at most 4 distinct sections. The local editor does not automatically rank highlights, recognize speech or render captions.

**What does not work from URL alone:** YouTube, Instagram, Facebook and similar webpage links are preview-only inside this browser editor. The user must select a saved video they own or are authorized to edit. A separate GitHub Actions workflow supports *owner-only* server-side rendering of accessible authorized sources, but is not securely connected to public one-click website submissions and may be blocked by upstream social platforms. Do not claim that pressing CHECK & PREPARE CUTS extracts or exports social media automatically.

**Verification notes:** Static JS syntax was checked across the app shell, plus mocked-DOM functional checks for direct-media import, rights prompts, file-picker handoff and clip card generation. Pure clip-algorithm tests cover 60s/3, 60s/10, 120s/6, 8s/10, 600s/10 and 61s/6. These are **code-level tests**, not full real-iPhone Safari/browser or end-to-end media export tests. A live browser-service test was unavailable; treat media recording/export support as device-dependent. Avoid publishing unsupported claims of end-to-end URL-to-AI-Shorts success.


**Actual code on GitHub, iPhone-first, Hinglish-friendly.** Paste a public long-video URL, request 1–10 highlight clips, and receive downloadable **15–60-second 9:16 MP4 Shorts** through GitHub Actions when the source video is accessible and you have rights to adapt it.

**Important:** The engine ranks moments using Whisper speech recognition, hook/topic keywords and scene changes. These scores are heuristic; they do **not** measure current social trends or guarantee virality. The UI is a static dashboard, not a service that silently downloads YouTube/Instagram content.

## New: Upload your own iPhone video directly inside GitHub

**No Apper, paid tools or separate hosting required.** The native [CutNova GitHub Issue form](https://github.com/addachai03-stack/index.html-/issues/new?template=cutnova-shorts.yml) now offers two mutually exclusive source methods:

- **Video URL:** Paste a public HTTPS supported URL, including direct MP4/MOV/WebM files.
- **Upload your video file:** Tap the GitHub upload field and choose an **MP4/MOV/WebM** file you own or are authorized to edit from the iPhone Files app. GitHub's issue-form upload limit for video is **100 MB**. If it is larger, export a shorter or more compressed copy first.

Only use **one** of those source fields. Confirm permission, choose 3/6/10 Shorts and duration, and tap **Submit new issue**. The GitHub Actions runner parses the resulting GitHub user-attachment URL, downloads authorized public media from GitHub's asset service with a 100 MB limit, then uses the same FFmpeg/Whisper Shorts engine. No YouTube anti-bot bypass is involved.

**Privacy & copyright:** This repo and the Issue are **PUBLIC**. GitHub upload attachments and source links are not a private storage vault, so **never attach private recordings, credentials, paid/private videos or material you may not share publicly.** If publishing your original on a public Issue is unsuitable, don't use this route.

A source-hosted upload test cannot be completed without an actual owner-supplied attachment. The existing unit tests cover upload syntax, link provenance, ownership confirmation, public-IP checks, redirect allowlists, and mocked streaming; a fresh real MP4 end-to-end run will be the remaining acceptance test.

## Real YouTube user URL diagnostic — 21 Nov 2026

The repository owner submitted [Issue #5](https://github.com/addachai03-stack/index.html-/issues/5) with a rights-confirmed public YouTube URL (`youtu.be/49D3EK0B1OY`), requesting **6 clips of 30–60 seconds**, engagement mode, auto crop and auto speech language.

The actual [GitHub Actions Shorts run](https://github.com/addachai03-stack/index.html-/actions/runs/44840282772) failed **during YouTube source extraction** with `Sign in to confirm you're not a bot`. A separate [read-only metadata preflight](https://github.com/addachai03-stack/index.html-/actions/runs/44840433627) hit the same block even without video downloading.

**Result:** zero user-source MP4s rendered. This does not indicate that the crop or caption renderer is broken; the renderer never received source media. The project does not bypass YouTube sign-in, DRM or anti-bot access restrictions, and it should not request passwords or raw session cookies.

**GitHub-only supported next route:** If you own or are authorized to use the source, supply a public direct **HTTPS .mp4/.mov/.webm** file URL that allows automated access (or use a rights-cleared source with suitable public access). In a new native GitHub Issue request, select the same desired settings. Do not share a private link or upload footage to a public place unless you intend it to be public.

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

## V1.6 — Active-word captions

Select **Caption style → Karaoke — active word** to burn yellow word highlights into MP4s. Uses Whisper word timestamps where available, with evenly spaced estimates when only segment timestamps exist. The exported `.ass` animation, ordinary `.srt`, and manifest timing-event counts are retained. Roman Hindi is optional and approximate. This is not forced-alignment accuracy or a viral-performance guarantee.

## V1.7 — Moving face framing (beta)

Choose **Portrait framing → Moving face crop**. OpenCV samples frontal faces at about one-second intervals, follows the nearest detected face position, and interpolates a smoothed horizontal crop path. The actual FFmpeg crop moves during the clip. If too few faces are detected, the crop is centered. This is sampled positioning, not continuous face identity or active-speaker tracking; multiple subjects, rotation, occlusions and profile views can reduce quality. Manifest records samples, method and path. Static Auto and Center modes remain available.

## V1.8 — Tight pacing

Optional **Pacing → Tight** detects quiet intervals of at least 0.8 seconds at -35 dB, retaining pause-edge padding and protecting recognized speech segments. Removes at most 35% of a clip and eight intervals, subject to the requested minimum length. Rebuilds the audio/video and remaps SRT and active-word timings on the edited timeline, then computes framing. Manifest records original-relative retained intervals and before/after duration. No speech, no suitable quiet pauses or a trim error retains original timing. Music and speech recognition errors can affect detection. Review cuts before publishing.

## V1.9 — Hook-aware highlight ranking

Multilingual cue matching preserves Hindi vowel marks, rewards hooks early in each clip, and considers speech-aligned candidate starts. Count-aware weighted interval scheduling finds high-scoring non-overlapping clips instead of replacing good highlights with arbitrary early windows when more clips are requested. Title and hook suggestions quote bounded source-ASR phrases. Scores are normalized content heuristics (0–1), not live viral prediction. Review all transcript suggestions and clip context before publishing.

## V2.0 — On-device manual Shorts editor

The website now has a separate local video editor. Select a local file (up to 500 MB), set an inclusive start/exclusive end with 1–60 seconds selected, preview the 9:16 center crop and export in real time with Canvas / MediaRecorder / Web Audio. MP4 is preferred if the browser reports support, otherwise supported WebM is offered; no fake MP4 extension. Audio is captured along with video. Browser compatibility, real-time pacing and seeking precision vary; backgrounding the app cancels recording. The file is not intentionally uploaded by this local editor. AI captions, automatic highlights and moving face crop are separate GitHub Actions features. This is not a full non-linear editing suite. Test on your device before relying on the export.

## V2.1 — Local editor effects

Choose Original, Vivid, Warm or Black & White; adjust brightness and contrast, set 0.75–2× playback speed, and add up to 80 characters of text at top or bottom. The same canvas draws the preview and recorded output. Non-default color effects use a 360×640 pixel buffer upscaled to 720×1280 for mobile compatibility. Export duration is estimated from selected source length and speed, restricted to 1–60 seconds. Playback/recording and audio pitch support vary by browser; this is not a frame-exact offline export. Preview on an actual device before relying on the result.

## V2.2 — On-device audio mixer

Select your authorized local audio file (up to 20 MB, decoded duration at most ten minutes). Independently control original sound and background music, mute the original, optionally loop the track, or remove it. The same Web Audio mix is routed to monitoring and the recorder; playback and recording restart music at the selected trim's output-time offset with speed adjustment. Combined gain is normalized to avoid excessive summing. Files are not uploaded by this editor. Browser decoding and audio recording support vary; interrupted or real-time recording requires review for timing and sound quality. No bundled copyrighted music or paid music service.

## V2.3 — Local project drafts

Use Save Draft to store the current video and optional audio blob, trim and effect/audio settings in this browser's IndexedDB. Resume replaces unsaved editor state only after confirmation. Save As New detaches the active draft; the next Save creates a separate record. Delete requires confirmation and removes only the stored copy, not the original device file. Combined media limit is 150 MB per draft; storage quota errors are displayed. Up to ten settings revisions are available for matching media, without preserving old media or exports. Rights confirmation must be renewed for export. No automatic cloud backup: browser data may be cleared/evicted, so keep original files. Actual iPhone IndexedDB and recording behavior needs device verification.

## V2.4 — Installable PWA

Visit the HTTPS GitHub Pages website online once, wait for the offline shell status to become ready, then use Safari Share → Add to Home Screen on iPhone. Standalone mode uses safe-area spacing and a scoped manifest. The service worker precaches only public static app files; no user media, private data, GitHub API results or external website requests are cached. Offline local editor and draft access depend on the device/browser and available storage. AI highlights, remote links, GitHub job history and artifact downloads require internet. Updates activate after previous app windows close; save drafts before reopening. Browser cache may be evicted. The iOS installation and offline recording still need on-device verification.

## V2.5 release hardening

Reject private/signed URL parameters and control characters, prevent duplicate request fields, avoid persistent checkout credentials, escape spreadsheet formulas, restrict page CSP, tighten draft/export guards and cap export painting near 25 fps. YouTube bot restrictions remain external: use official Save to device for your own uploaded footage, then local editing or authorized public GitHub upload. Real-device Safari testing and independent security assessment remain required.

### V2.5.1 storage compatibility

When a local draft Blob write fails, retry with plain ArrayBuffer media records for combined media up to 50 MB. Existing Blob drafts remain readable. Storage quotas and private/ephemeral browsing still apply. No media is uploaded. Browser proof is not proof of physical iPhone playback.


## V2.6 — Android APK + simplified cross-platform mobile layout

iPhone Safari and Android Chrome use a fixed five-tab bottom navigation (Home, AI, Editor, Projects, Results); only the selected main screen is shown on narrow screens. The editor keeps a quick preview/export/cancel bar at the bottom. Draft/video state persists across tab switches in the current tab, with rights still manually confirmed. Existing links (#studio, #local-editor, #render-history) remain supported. Desktop keeps the previous full layout.

The Android APK is a browser-backed Trusted Web Activity **candidate** (Android Browser Helper), not a native video renderer. The public GitHub Pages site at the repository subpath cannot currently publish Digital Asset Links at the host-root /.well-known/assetlinks.json, so browsers may fall back to a Custom Tab with URL bar; offline caching, storage, and export compatibility depend on the installed browser. It requires a compatible Android browser and internet on first launch. Test/beta builds are signed for sideload testing and should not be treated as a production Play Store signing identity. Do not share the signing key or install APKs from untrusted sources.

## CutNova beta launch celebration — November 21, 2026

The website Home tab includes a compact public beta milestone card, links to the free on-device editor and Android v2.6.2 beta APK, and an optional native share/copy invite. It is not an AI rendering entitlement: AI is still owner-controlled, external social downloads may be blocked, and user video remains local for the editor. No private information is included in share text; user chooses recipient. Android launcher/media testing and iPhone export have been reported working by the owner; no claim of Play Store/App Store publication or large-scale production readiness.

## V2.7 local-first Quick Shorts generator

The primary Generate flow no longer opens GitHub. Users select their own video in the browser, choose 1/3/6 clip suggestions and a duration, then choose a suggested time interval to open the local canvas editor and export. This is **timed segmentation**, not speech-aware highlight detection or server-powered AI. Export uses local real-time MediaRecorder and browser codec support. URLs for YouTube/Instagram/etc can be previewed, but not extracted by a static webpage; for allowed public direct MP4/MOV/WebM links, a CORS-enabled fetch with byte limits can supply the same local flow. GitHub AI render remains an opt-in owner-only advanced panel with an explicit public disclosure. No video is uploaded by the local flow. 

## V2.7.1 — PWA stale-cache recovery

A screen recording showed a prior cached V2.6 URL-to-GitHub interface on iPhone even after V2.7 deployment. To avoid trapping users in outdated HTML, V2.7.1 uses network-first caching for the allowlisted public app shell with offline fallback. A non-cached /refresh.html route can be reached through an OLD service worker's fetch handler, checks for a new worker, and asks the user to activate it after saving edits. The update page never deletes browser storage, indexedDB drafts or user videos. The primary app provides an UPDATE APP link. Avoid updating while actively exporting. Video import uses own file and optional CORS-compatible direct media only; social links are preview-only.


## V4.5 beta — Auto Live monitor (reference-video-inspired)

The new **Auto Live phone dashboard** (autolive.html) adds a channel-first monitoring workflow inspired by the submitted reference video, but clearly separates implemented features from future automation.

**Implemented in this release:**
- Choose a Twitch username or YouTube @handle / UC channel ID, with validation and an on-device-only target preference.
- Official Twitch Helix or YouTube Data API scheduled read-only LIVE/OFFLINE checks, once the repository owner configures matching variables and private API secrets.
- Publish public time-stamped autolive/status.json through GitHub Actions, marking checks over 90 minutes old as stale rather than claiming continuous monitoring.
- On Twitch only, review existing public Twitch clips from the last 48 hours, sorted by view count. Open official clip links; optionally copy an editorial posting draft after rights confirmation; open CutNova's existing saved-file editor.
- Detect status returning LIVE after an OFFLINE check (reconnect count), without guaranteeing instant resume detection. No source media or API credentials are uploaded from the browser.

**One-time owner setup:** Under repository Settings → Secrets and variables → Actions, create variables CUTNOVA_STREAM_PLATFORM (twitch or youtube) and CUTNOVA_STREAM_CHANNEL (the channel selected). For Twitch, add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET as secrets from your own Twitch developer app. For YouTube, enable YouTube Data API in your own Google Cloud project and add YOUTUBE_API_KEY as a secret. Run the Auto Live Monitor workflow manually once; scheduled checks occur approximately every 30 minutes subject to GitHub limitations, delays, disablement, quotas and platform API availability. Only one configured channel can be monitored at once. Never put tokens in public website forms, GitHub source or chat. YouTube search requests consume API quota.

**Not implemented:** automated live recording, creating new Twitch or YouTube clips, detecting chat spikes, ranking source video with AI, AI subtitles/hooks from a live stream, auto-rendering vertical MP4s, Instagram DM delivery, and guaranteed unlimited/always-on clips. The advertised features in the reference recording are not treated as proof that CutNova can perform them. Future content capture/reposting requires broadcaster permission and platform-compliant access. Existing public Twitch clips are not a license to repost.

Tests: python -m unittest discover -s tests; node tests/test_autolive.cjs. Never configure credentials in test fixtures or browser JS.


## V4.6 — Public moment review shortlist (local-first; no new clip creation)

CutNova Auto Live now goes one step beyond status-only monitoring with a real **metadata-based moment shortlist** for already-published Twitch clips:

- After the owner configures the Twitch official API and a channel, the scheduled monitor reads up to 20 public clips from the last 48 hours and provides up to six eligible 15–60 second review candidates in the same public JSON status.
- A transparent relative review score (0–100) uses **public views, clip age, estimated views per hour and duration**. It does **not** inspect video/audio, analyze chat, recognize faces, transcribe speech, predict viral performance or create a new highlight. Every candidate includes human-readable reasons.
- On iPhone, select Top 1 / 3 / 6, review the official Twitch clip, add selected clip links to an **on-device review queue**, prepare/copy a plain-text caption draft after confirming reuse rights, or download a text review plan.
- No clip video files, credentials, posting accounts or private media are collected. The review queue is browser-local and can be cleared; it is not a cloud backup. The text review plan is not a finished MP4.
- Official Twitch clips can only be republished with creator permission and in compliance with Twitch/platform rules. The local editor remains available for video files legitimately saved by the user.

**Status:** working ranking/queue code and automated unit tests, but real end-to-end official API use still requires owner-supplied Twitch credentials in repository secrets and the single monitored channel in Variables. YouTube continues to offer public LIVE/OFFLINE checks only; it does not return Twitch clip candidates. Existing GitHub Actions schedule is approximate, not continuous stream recording.

Remaining major features from the submitted reference: broadcaster-approved live source capture or eligible platform clipping integration, true video-content/audio highlight scoring, on-demand rendering with real caption alignment, and explicitly authorized publishing/DM delivery. These are **not** currently active.

Checks: `python -m unittest discover -s tests -v` and `node tests/test_moment_queue.cjs`.

## V4.7 — On-device visual-change finder (iPhone beta)

The AI tab now offers FIND VISUAL MOMENTS under the existing saved-video/timed-cut workflow. The scanner reads only the video chosen in CHOOSE VIDEO FROM PHONE. It starts after a click and requires the same content rights checkbox. No file is uploaded, and existing timed cuts and owner GitHub rendering stay unchanged.

- A browser video element uses a temporary local blob URL. A tiny 64×36 canvas samples at most 46 frames from the first 12 minutes; even longer footage is only partially scanned.
- A simple RGB frame-difference heuristic proposes up to 1, 3 or 6 non-overlapping 15/30/45/60-second review windows. Scores are relative visual-change signals, not AI confidence or viral predictions.
- Tap REVIEW IN EDITOR to open the suggested window in the existing local editor, where rights are reconfirmed before actual export. CANCEL SCAN aborts sampling and cleans up temporary media URLs.
- No source video, extracted frames, microphone audio or private projects are sent to GitHub/Cloudflare, and PWA caches contain only public application scripts.

Limits: visual changes can mean camera movement, lighting, or scene cuts. This does not detect gameplay excitement, conversation highlights, audio, subtitles, face identity, speech hooks, chat spikes or exact action boundaries. Low-motion footage may produce no candidates; use existing timed cuts. Safari video seeking and codec support vary on real iPhones. No MP4 is produced until the user explicitly exports. Automatic stream capture/DM delivery remain unavailable.

Tests: node tests/test_local_highlights.cjs; GitHub CI.

## V4.8 — Optional local audio-energy peaks (iPhone beta)

CutNova's AI tab now has **FIND AUDIO PEAKS** alongside timed cuts and sampled visual changes. This works on your own saved video only after a deliberate tap and editing-rights confirmation. It is a relative volume/energy heuristic, not speech recognition, sentiment, a content-ranking model or a guarantee of viral moments.

- For video up to 3 minutes, CutNova attempts to decode the selected local video's audio using Web Audio. The input to the decoder must be under 20 MB. MP4/MOV audio decoding is browser-dependent, so iPhone Safari may reject it.
- If decoding the video track is unsupported, optionally choose a matching full-length MP3/M4A/WAV/AAC/OGG audio file. The selected video's duration and the audio duration must match within 2 seconds. The app cannot verify that they contain identical content, so the user is responsible for aligning the correct track.
- The app scans at most 180 seconds in half-second windows using bounded RMS audio energy. Short relative loudness spikes can yield up to 1/3/6 non-overlapping 15/30/45/60-second review windows. Constant background music/noise may yield zero candidates instead of invented highlights.
- Each **REVIEW IN EDITOR** button opens the selected original video and suggested window in the existing local editor, where rights are reconfirmed. No file is exported until the user explicitly exports it. The scanner does not generate captions.
- Temporary metadata blob URLs and AudioContext are released. Cancel prevents another decode from starting until cleanup finishes. No microphone, API keys, cloud uploads, live-stream downloads, account login, background posting, or local media persistence are added.

Status: implementation and unit tests exist, while end-to-end Safari decoding and actual iPhone export remain to be verified on device. Videos beyond 3 minutes can still use the previously supported local visual scan and manual timed cuts. YouTube/Twitch live monitoring still requires owner-managed API credentials.

Run: `node tests/test_audio_peaks.cjs` plus GitHub Code Checks.

## V4.9 — SMART MIX: local visual + audio review shortlist (iPhone beta)

Smart Mix is a **one-tap, on-device** candidate finder in CutNova's saved-video quick-cut area. Select your own video, check editing rights, and tap FIND SMART CLIPS ON PHONE. The file stays in the current browser session; no upload, livestream recording, AI transcription, automatic posting, or clip rendering is performed.

- An independent scanner samples tiny 64×36 visual frames across videos of **15–180 seconds**, using the proven V4.7 scene-difference math.
- If supported, Web Audio decodes audio from the selected video (or the optional full-length matching audio file already available in FIND AUDIO PEAKS), with a 20 MB audio input cap and a two-second video/audio duration alignment check.
- It scores up to six visual and six audio candidate windows. A **relative heuristic** combines nearby visual and sound peaks (with a small overlap bonus), then selects 1, 3, or 6 non-overlapping 15/30/45/60-second candidate windows.
- If audio decoding is unsupported or no distinct peaks are present, the UI explicitly says visual-only. If frames cannot be sampled but audio can, the UI can show audio-only. If no signal qualifies, it suggests ordinary timed cuts instead of pretending to find a highlight.
- REVIEW IN EDITOR moves the selected file and trim range to the existing manual local video editor. Rights must be reconfirmed before export. A successful suggestion is **not** a finished MP4 or a verified great moment.
- Both the visual media blob URL and the local AudioContext are cleaned up; cancellation/quick-file changes invalidate old results. Long or heavy files can still use separate V4.7 visual-only and ordinary timed cuts.

Important: Smart Mix detects **relative sampled frame changes and loudness spikes**, not words, emotions, humour, viewer reactions, real highlights or virality. Browser decoder support and actual MP4 export on Safari still require device verification. Local media never goes to GitHub or cloud storage through this feature. Stream monitor remains NOT_CONFIGURED until official platform API credentials are supplied privately by the owner.

Tests: node tests/test_smart_mix.cjs, node tests/test_local_highlights.cjs, node tests/test_audio_peaks.cjs, plus GitHub CI.

## V5.0 — iPhone device-readiness and export evidence report

The local editor includes a **REAL IPHONE READINESS REPORT**, replacing guesses about Safari support with explicit, separate evidence. Click **RUN DEVICE CHECKS** after selecting your own source video in the AI tab or editor. No video/audio is sent to a server, and it does not silently run in the background.

- The checker verifies only declared MediaRecorder/canvas/WebAudio API support (not actual recording success), and tries to decode a real frame from the user-selected video using a temporary local blob URL.
- It can attempt a bounded local audio decode on the selected video or optional audio file if the input is no larger than 20 MB. Audio signal present or decoded is *not* the same as verified loudness/audibility.
- **GO TO FULL EXPORT TEST** scrolls to the existing 5-second original test-source generator. That flow still requires explicit user confirmation of rights, manual EXPORT SHORT, verification of actual 720x1280 playback and a manually selected downloaded file from Files.
- Structured in-page events from the existing real editor, playback checker, codec inspection and Files round-trip checker update seven independent statuses. The report distinguishes NOT TESTED, FAIL, RECORDED, PASS, BASIC MATCH and UNVERIFIED. An export Blob does not count as a playback PASS; a codec entry alone does not mean a social upload will work.
- COPY PRIVATE-SAFE TEST REPORT sends only evidence statuses and generic diagnostics to the clipboard after an explicit tap; it excludes file names, media bytes, URLs, credentials and any automatic storage/upload.

**Not yet verified:** A real iPhone has not executed this flow in the user's Safari/browser session; playback, Files persistence, audio audibility and successful social upload must not be claimed from CI. This adds a testing path, not true autonomous livestream clipping, speech recognition or automatic publishing.

Run `node tests/test_device_qa.cjs` and normal GitHub Code Checks.

## V5.0 automated Chromium smoke checks (free public GitHub Actions)

`.github/workflows/browser-smoke.yml` checks the real UI in a mobile-sized Chromium viewport and a desktop Chromium viewport. It generates its own original 6-second VP8/Opus WebM video with sine-wave test audio, serves the current repo in the runner, then opens the website, clicks RUN DEVICE CHECKS without a file, checks that export/playback/Files remain NOT TESTED, selects its synthetic video, re-runs the check, and requires successful local source-frame decode. Optional audio decode reports PASS or FAIL depending on the runner; it is not fabricated.

After the run, GitHub Actions provides screenshots of the synthetic fixture's UI states (3-day artifact). No real user video is uploaded or copied into Actions; no credentials, sign-in, social publishing or export actions occur. This is **NOT a Safari/WebKit test and NOT physical iPhone verification**: mobile viewport emulation in headless Chromium can catch layout and JavaScript failures but cannot prove real iPhone rendering, audio playback, MP4 export or Files persistence.

CI: GitHub Actions → **CutNova - Free Browser Smoke Test**, or review that workflow's PR/commit run and optional screenshots. The local-device V5.0 evidence controls remain separate and must be run on the actual phone before claiming device support.

## V5.1 — Browser end-to-end local export evidence (synthetic footage)

The free GitHub Actions browser-smoke workflow now runs `tests/browser_export.py` after the V5.0 readiness checks. A GitHub-hosted Chromium browser uses the generated original 6-second VP8/Opus WebM fixture (no private user content), opens the real CutNova editor, sets a 0–3s trim, explicitly confirms the synthetic source rights, then **actually clicks EXPORT SHORT**.

The test waits for a non-empty real editor download blob, checks an actual `RECORDED` evidence event, invokes the production decoded-portrait playback verifier, downloads the emitted file via the browser, selects that exact file again via the built-in file picker, and runs the production byte-for-byte Files verification. It asserts each actual verifier PASS and collects safe synthetic screenshots on desktop and mobile-width Chromium. No posts, microphone or social-media actions.

**Important:** If export, duration, codec, playback or saved-copy checks fail, CI must fail. A passing Chromium synthetic export is **not** proof of export on the user's iPhone Safari. That device still needs V5.0's `RUN DEVICE CHECKS` and manual original phone video / Files verification.

## V5.2 — Private on-device H.264/AAC converted-file verifier

CutNova's local editor now shows a **PRIVATE SOCIAL FORMAT VERIFIER** that works with a video manually selected from iPhone Files even if it was converted outside CutNova. The site does not upload the selected media, expose its filename in the report, persist it, silently convert it or share it with GitHub.

- Choose a user-owned video (1 KiB–250 MiB) and tap **CHECK CONVERTED FILE FORMAT**. The app reuses its bounded MP4 sample-entry parser and checks actual MP4 `avc1`/`avc3` H.264 video track entries and `mp4a` audio track entries. It explicitly rejects VP9/Opus and unknown/encrypted track combinations, even when the file extension is .mp4.
- This gives a **BASIC MATCH**, not a guarantee of AAC audio object type, profile, bitrate, full file integrity, audible audio or Instagram acceptance. The code cannot prove a successful conversion from the filename or the browser's `isTypeSupported()` claim.
- A separate **VERIFY CONVERTED VIDEO PLAYBACK** button tests that the selected video's decoded metadata is in 9:16 portrait (1–65s) and that playback time actually advances by at least 0.25s. Some browsers can inspect H.264 atoms without being able to decode the video; the two checks remain separate. The user still must listen to the file and verify final posting separately.
- Private phone-only fallback: use Apple's built-in Shortcuts app to process a manually saved file with **Encode Media** and **Audio Only OFF**, choosing H.264 if the device offers that video format, then **Save File**. UI actions and available formats vary by iOS release; this does not run inside CutNova, and CutNova claims no conversion until the user independently checks the resulting file.
- A separate existing owner-only GitHub FFmpeg H.264/AAC converter remains limited to authorized PUBLIC direct HTTPS or GitHub attachment URLs. Do not use it for private footage, personal iPhone Files, private/signed URLs or secret links.

Automated validation: `node tests/test_social_file_verify.cjs`; browser smoke produces two original synthetic clips, an H.264/AAC MP4 and an MP4 containing VP9/Opus, then checks their actual client-side sample-entry verdict at simulated iPhone-width and desktop Chromium viewports. This is not physical iPhone Safari testing; a successful metadata check is not a real platform upload.

## V5.2 add-on — Real 1-second recording codec preflight

The existing `TEST 1-SECOND RECORDING` now inspects actual recorded media track entries (using the same local bounded MP4 parser as the export inspector), **not just MediaRecorder.isTypeSupported or an .mp4 file extension**. It creates only a fresh synthetic 1-second moving canvas and quiet sine tone from the user's tap, no microphone or Photos access and no upload.

- Tries the editor's explicit H.264/AAC requests first; browsers may still output MP4 with VP9 video + Opus audio. This is reported as **H.264/AAC NOT VERIFIED**.
- If the synthetic result actually includes `avc1`/`avc3` video and `mp4a` MP4 audio, it reports only a **BASIC** codec-track match: actual AAC profile, quality, audibility and platform upload remain untested.
- Only when this actual basic match followed an explicit strict MIME request is **SELECT STRICT H.264/AAC FOR NEXT EDITOR EXPORT** offered. It merely sets the editor checkbox after a user click; it never starts export, accepts rights or sends private files. Actual exported video still needs its own codec check and playback.
- Owner-only verified FFmpeg H.264/AAC conversion remains available for authorized PUBLIC media URLs only. Never send private iPhone Files or signed/private links to public Actions.

The free browser export test now records the 1-second synthetic probe and rejects false claims when its actual MP4 tracks are VP9/Opus. This is Chromium testing, **not physical iPhone Safari validation**. Separately, the V5.2 private Files verifier on main can inspect user-chosen videos but cannot convert or publish them.


## V5.3 — Private local audio listening confirmation

The private iPhone Files verifier adds a direct-tap **PLAY LOCAL AUDIO CHECK** for a user-selected file. It plays the video with audio enabled and checks that playback advances; then the user explicitly selects **I HEARD AUDIO** or **NO SOUND HEARD**. The browser cannot prove physical speaker/headphone audibility, so only the user's own button records that observation. Selecting another file resets the confirmation. The video remains in the local browser object URL; no upload, conversion, or sharing occurs. Automated tests validate state guards and honest labels; this is not physical iPhone QA.


## V5.4 — Local share-preparation checklist

After selecting a local file, the user can generate and save a plain-text checklist. It reports the current codec sample-entry result, local playback check, dimensions/duration and the user's explicit audio-heard confirmation. It omits the filename/path and contains manual review boxes for cuts, captions, rights and destination platform requirements. This is not an upload, encoder, automatic publishing action, or guarantee of platform acceptance. The generated report blob is local and its object URL is revoked on page exit.
