# CutNova V2.8 — Owner-only secure URL → AI Shorts bridge

## What is deployed
- Static CutNova website: https://addachai03-stack.github.io/index.html-/
- Owner-only Cloudflare Worker: https://cutnova-render-api.addachai03.workers.dev
- Cloudflare Worker source: `backend/cutnova-render-worker.js`
- Browser integration: `owner-render.js` (included in the PWA cache)
- Existing protected workflow: `.github/workflows/shorts.yml`

The browser calls `GET /health` and displays backend readiness. On owner approval it calls `POST /render` with a public HTTPS source URL, settings, and a private owner key. The Worker validates the request and dispatches `shorts.yml` through GitHub's authenticated API. No GitHub credentials live in HTML, GitHub Pages, or client JavaScript. Only the configured owner can run it. Successful dispatch is NOT a successful MP4 render; check actual results under the CutNova RESULTS tab.

## Required owner configuration (never paste tokens in GitHub code, issues or ChatGPT chat)
**The endpoint is deliberately LOCKED until both Cloudflare Worker secrets are configured.** Open the Cloudflare dashboard → Workers & Pages → `cutnova-render-api` → Settings → Variables and Secrets. Add:

1. `CUTNOVA_GITHUB_TOKEN`: fine-grained GitHub personal access token restricted to `addachai03-stack/index.html-`, with **Actions: Read and write** repository permission. Set a limited expiry and rotate it. The workflow must be enabled on `main`.
2. `CUTNOVA_OWNER_KEY`: a unique randomly generated secret with **at least 24 characters**, separate from the GitHub token. Store it safely. The owner types only this key into the CutNova secure-render panel; do not store it in the public repo, browser autofill or localStorage.

After setting secrets, visit `/health` (which returns only `configured:true/false`) and open **Advanced: GitHub AI rendering (owner only)** on CutNova. Enter an authorized public URL and confirm editing rights. The UI will show **START PRIVATE AI RENDER** if ready. Click it to send an authenticated dispatch without navigating away. Results appear in the CutNova Results tab, using GitHub's public Actions history; the owner may need GitHub sign-in to download artifacts.

**Important:** GitHub may return 200 with a run ID or legacy 204 for workflow dispatch. This gateway accepts both. GitHub can reject requests if Actions are disabled, token permission is missing, or the owner has exceeded applicable usage limits. Keep token permissions minimal. Before any future redeployment, preserve Worker secret bindings; do not replace configured secrets with an empty binding set.

## Limits / guarantees
- The backend **does not bypass** YouTube/Instagram bot checks, copyrights, DRM, login walls or private videos.
- `yt-dlp`, Whisper and FFmpeg run on GitHub Actions only when the source is authorized, publicly accessible to GitHub runners, and the action is permitted.
- The public website remains safe to use for local cuts even if the owner render backend is unconfigured or offline.
- Free usage depends on GitHub Actions and Cloudflare account limits. No assertion of unlimited processing.
- API access is restricted to the exact GitHub Pages origin and an owner-held secret, never to arbitrary public callers. Origin is defense-in-depth; the owner key is the primary credential.
- CutNova local clipping generates **timed cuts**, not automatic AI highlights. Actual AI ranking/captions require the GitHub workflow and source access.

## Security checks before public enabling
- Use a strong independent owner secret, not a demo value.
- Limit GitHub PAT to this repository and Actions permission only.
- Restrict/disallow excessive workflow runs to avoid abuse/usage surprises.
- Run an authorized test with a small direct MP4 first; check the actual GitHub run/artifact. Do not claim end-to-end success from source-code tests alone.
