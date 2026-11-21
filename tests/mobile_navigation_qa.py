"""Real headless Chromium/WebKit mobile navigation QA — no render or credentials.

Runs against a local copy of CutNova's actual source in CI. External GitHub status
is mocked with realistic read-only responses so UI state is deterministic. This
does not claim to be a physical iPhone Safari test or a live owner-key test.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path("mobile-qa-proof")
ROOT.mkdir(exist_ok=True)
ENGINE = os.environ.get("ENGINE", "chromium")
TRACK_ID = "550e8400-e29b-41d4-a716-446655440000"
RUN_ID = 44942618474
ART_ID = 14722321472
SAMPLE_URL = "https://remotion.media/video-1m.mp4"
REPORT = {"browser_engine": ENGINE, "viewport": "390x844", "physical_iphone": False,
          "real_render_started": False, "owner_key_used": False, "checks": {}}
server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}/"
EXPIRY = (datetime.now(timezone.utc) + timedelta(days=6)).isoformat()
github_run = {"id": RUN_ID, "run_number": 3, "event": "workflow_dispatch",
              "status": "completed", "conclusion": "success",
              "created_at": "2026-11-21T19:45:18Z",
              "display_title": "CutNova owner " + TRACK_ID}
github_artifact = {"id": ART_ID, "name": "cutnova-shorts-3",
                   "size_in_bytes": 9218656, "expired": False,
                   "expires_at": EXPIRY}
requests = []
errors = []


def fulfill_json(route, value, status=200):
    route.fulfill(status=status, content_type="application/json",
                  headers={"access-control-allow-origin": "*", "cache-control": "no-store"},
                  body=json.dumps(value))


def mock_request(route):
    url = route.request.url
    requests.append({"url": url, "method": route.request.method})
    if "/render" in url or "/verify" in url:
        raise AssertionError("Unauthorized workflow/owner authentication endpoint requested during read-only QA: " + url)
    if url.endswith("/health"):
        return fulfill_json(route, {"service": "CutNova render bridge", "status": "online",
                                    "configured": True, "mode": "owner-only"})
    if "/actions/workflows/issue-shorts.yml/runs" in url:
        return fulfill_json(route, {"workflow_runs": []})
    if "/actions/workflows/shorts.yml/runs" in url:
        return fulfill_json(route, {"workflow_runs": [github_run]})
    if f"/actions/runs/{RUN_ID}/artifacts" in url:
        return fulfill_json(route, {"artifacts": [github_artifact]})
    if f"/actions/runs/{RUN_ID}/jobs" in url:
        return fulfill_json(route, {"jobs": []})
    raise AssertionError("Unexpected mocked GitHub request: " + url)


def visible_width(page):
    sizes = page.evaluate("""() => ({
      viewport: innerWidth, width: document.documentElement.scrollWidth,
      shell: document.querySelector('.app-shell')?.scrollWidth ?? 0,
      visibleButtons: [...document.querySelectorAll('button')].filter(e => {
        const rect=e.getBoundingClientRect(),style=getComputedStyle(e);
        return rect.width>0 && rect.height>0 && style.visibility !== 'hidden' &&
          rect.bottom>0 && rect.top<innerHeight;
      }).map(e=>({id:e.id,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right}))
    })""")
    assert sizes["width"] <= sizes["viewport"] + 1, f"Horizontal overflow: {sizes}"
    # A clipped interactive control is a practical mobile usability defect.
    bad = [b for b in sizes["visibleButtons"] if b["right"] > sizes["viewport"]+1 or b["x"] < -1]
    assert not bad, f"Buttons outside viewport: {bad}"
    return sizes


def mobile_tab(page, tab, section_id):
    page.locator(f'#mobile-nav [data-nav="{tab}"]').click()
    expect(page.locator("#" + section_id)).to_be_visible(timeout=12000)
    expect(page.locator(f'#mobile-nav [data-nav="{tab}"]')).to_have_attribute("aria-current", "page")
    visible_width(page)
    REPORT["checks"]["tab_" + tab] = "PASS"


try:
    with sync_playwright() as p:
        browser = getattr(p, ENGINE).launch()
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=3, is_mobile=True, has_touch=True,
            service_workers="block", accept_downloads=True)
        # Use only a public, fake UUID. Never touch owner keys or render jobs.
        context.add_init_script(
            f"sessionStorage.setItem('cutnova-latest-request-id', '{TRACK_ID}');")
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("https://cutnova-render-api.addachai03.workers.dev/**", mock_request)
        page.route("https://api.github.com/repos/addachai03-stack/index.html-/**", mock_request)
        page.route("https://remotion.media/**", lambda route: route.abort())
        page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
        expect(page.locator("#mobile-nav")).to_be_visible()
        visible_width(page)
        REPORT["checks"]["mobile_shell"] = "PASS"
        page.screenshot(path=str(ROOT / f"{ENGINE}-home.png"), full_page=False)

        mobile_tab(page, "ai", "studio")
        expect(page.locator("#video-url")).to_be_visible()
        expect(page.locator("#load-ai-test-video")).to_be_visible()
        page.locator("#load-ai-test-video").click()
        expect(page.locator("#video-url")).to_have_value(SAMPLE_URL)
        expect(page.locator("#clips-count")).to_have_value("2")
        expect(page.locator("#min-seconds")).to_have_value("30")
        expect(page.locator("#max-seconds")).to_have_value("30")
        assert not page.locator("#rights-confirm").is_checked(), "No implicit rights consent"
        expect(page.locator("#owner-render-tools")).to_have_attribute("open", "")
        expect(page.locator("#secure-render-verify")).to_be_enabled()
        REPORT["checks"]["owner_ai_safe_sample"] = "PASS"
        page.screenshot(path=str(ROOT / f"{ENGINE}-ai.png"), full_page=False)

        mobile_tab(page, "results", "render-history")
        expect(page.locator("#job-results .job-row")).to_have_count(1, timeout=16000)
        # The actual job must be visible without scrolling through a full-page
        # paragraph; collapsed help keeps the first mobile screen actionable.
        expect(page.locator(".results-help")).not_to_have_attribute("open", "")
        box = page.locator("#job-results .job-row").bounding_box()
        assert box is not None and box["y"] < 660, (
            "Results job buried below mobile fold: " + str(box))
        REPORT["checks"]["results_card_above_fold"] = "PASS"
        expect(page.locator("#job-results .job-owner-note")).to_contain_text("YOUR LATEST OWNER RENDER")
        expect(page.locator("#job-results .job-success")).to_have_text("SUCCESS")
        expect(page.locator("#job-results .artifact-file")).to_have_count(1, timeout=16000)
        artifact_link = page.locator('#job-results a[href$="/artifacts/14722321472"]')
        expect(artifact_link).to_be_visible()
        expect(artifact_link).to_contain_text("Open rendered files ZIP")
        expect(page.locator("#job-results")).to_contain_text("MiB")
        assert all(r["method"] == "GET" for r in requests), "Read-only app made non-GET backend request"
        REPORT["checks"]["real_data_results_mock"] = "PASS"
        REPORT["checks"]["owner_artifact_link"] = "PASS"
        page.screenshot(path=str(ROOT / f"{ENGINE}-results.png"), full_page=False)

        mobile_tab(page, "editor", "local-editor")
        expect(page.locator("#edit-export")).to_be_disabled()
        REPORT["checks"]["editor_idle_safe"] = "PASS"
        expect(page.locator("#edit-check-export")).to_be_visible()
        page.locator("#edit-check-export").click()
        # The probe starts from the user's click; report success, unsupported
        # capabilities, or genuine runtime recording failure distinctly.
        page.wait_for_function("""() => /^(RECORDED TEST CLIP|UNSUPPORTED|RECORDING FAILED)/.test(
          document.querySelector('#edit-check-status')?.textContent || '')""", timeout=12000)
        diagnostic=page.locator("#edit-check-status").inner_text()
        if diagnostic.startswith("RECORDING FAILED"):
            REPORT["checks"]["synthetic_export_probe"]="FAIL: "+diagnostic
            raise AssertionError(diagnostic)
        if diagnostic.startswith("UNSUPPORTED"):
            REPORT["checks"]["synthetic_export_probe"]="NOT SUPPORTED: "+diagnostic
        else:
            assert "No file was stored/uploaded" in diagnostic
            REPORT["checks"]["synthetic_export_probe"]="PASS: local test clip recorded"
        if diagnostic.startswith("UNSUPPORTED"):
            REPORT["checks"]["full_edited_video_export"]="NOT SUPPORTED: Browser lacks the local recording features"
        else:
            # Make source media on the actual browser, import it in the existing
            # local editor, explicitly confirm rights and export/downloading it.
            page.locator("#edit-prepare-test").click()
            page.wait_for_function("""() => /^(DEMO READY|DEMO PREPARATION FAILED|UNSUPPORTED)/.test(
              document.querySelector('#edit-prepare-status')?.textContent || '')""", timeout=32000)
            demo_status=page.locator("#edit-prepare-status").inner_text()
            if not demo_status.startswith("DEMO READY"):
                REPORT["checks"]["full_edited_video_export"]="FAIL: "+demo_status
                raise AssertionError("Actual editor import failed: "+demo_status)
            expect(page.locator("#edit-fields")).to_be_visible()
            expect(page.locator("#edit-start")).to_have_value("0")
            expect(page.locator("#edit-end")).to_have_value("3")
            assert not page.locator("#edit-rights").is_checked(), "Rights consent must never be assumed"
            page.locator("#edit-require-h264").check()
            # A generic MP4 encoder must not be mistaken for real H.264/AAC.
            strict_available=page.evaluate("""() => [
              'video/mp4;codecs=avc1.42001f,mp4a.40.2',
              'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
              'video/mp4;codecs=avc1.424028,mp4a.40.2',
              'video/mp4;codecs=avc1,mp4a.40.2'
            ].some(x=>MediaRecorder?.isTypeSupported?.(x))""")
            if strict_available:
                expect(page.locator("#edit-format")).to_contain_text("STRICT H.264/AAC REQUEST AVAILABLE")
                REPORT["checks"]["strict_social_codec_selection"]="PASS: explicit H264/AAC profile offered, never generic MP4"
            else:
                expect(page.locator("#edit-format")).to_contain_text("STRICT MODE UNSUPPORTED")
                REPORT["checks"]["strict_social_codec_selection"]="PASS: unsupported explicit H264/AAC does not silently choose MP4/WebM"
            page.locator("#edit-rights").check()
            if not strict_available:
                expect(page.locator("#edit-export")).to_be_disabled()
            page.locator("#edit-require-h264").uncheck()
            expect(page.locator("#edit-export")).to_be_enabled()
            page.locator("#edit-export").click()
            expect(page.locator("#edit-result")).to_be_visible(timeout=45000)
            assert (page.locator("#edit-download").get_attribute("href") or "").startswith("blob:"), "Export provided no local download blob"
            expect(page.locator("#edit-share-file")).to_be_enabled()
            # Headless browser cannot display the real iOS OS Share Sheet.
            # Test unsupported behavior, then mock ONLY the navigator.share API
            # and verify the exact generated File is passed upon a click.
            page.evaluate("""() => {
              Object.defineProperty(navigator, 'canShare', {value: undefined, configurable: true});
              Object.defineProperty(navigator, 'share', {value: undefined, configurable: true});
            }""")
            page.locator("#edit-share-file").click()
            expect(page.locator("#edit-share-status")).to_contain_text("NATIVE FILE SHARE UNAVAILABLE")
            REPORT["checks"]["share_sheet_unavailable_fallback"]="PASS: DOWNLOAD SHORT remains available"
            page.evaluate("""() => {
              window.__cutnovaShareCalls=0;
              Object.defineProperty(navigator,'canShare',{configurable:true,
                value:({files})=>Array.isArray(files)&&files.length===1});
              Object.defineProperty(navigator,'share',{configurable:true,
                value:async ({files})=>{
                  window.__cutnovaShareCalls++;
                  window.__cutnovaShared={name:files[0].name,size:files[0].size,type:files[0].type};
                }});
            }""")
            page.locator("#edit-share-file").click()
            expect(page.locator("#edit-share-status")).to_contain_text("SHARE SHEET CLOSED")
            shared=page.evaluate("({calls:window.__cutnovaShareCalls, file:window.__cutnovaShared})")
            assert shared["calls"]==1,shared
            assert shared["file"]["name"].startswith("CutNova_Manual_Short."),shared
            assert shared["file"]["size"]>1024,shared
            REPORT["checks"]["native_share_api_mock"]="PASS: user-click provided real exported File to mocked native API; no physical iPhone test"
            # Real decoded video must actually play and advance; recorder success alone
            # is not equivalent to a playable media export.
            page.locator("#edit-verify-playback").click()
            page.wait_for_function("""() => /^(LOCAL PLAYBACK PASS|LOCAL PLAYBACK FAILED)/.test(
              document.querySelector('#edit-verify-status')?.textContent || '')""", timeout=16000)
            playback_status=page.locator("#edit-verify-status").inner_text()
            if not playback_status.startswith("LOCAL PLAYBACK PASS"):
                REPORT["checks"]["exported_video_playback"]="FAIL: "+playback_status
                raise AssertionError(playback_status)
            REPORT["checks"]["exported_video_playback"]="PASS: actual exported blob decoded and advanced in browser"
            with page.expect_download(timeout=15000) as download_info:
                page.locator("#edit-download").click()
            downloadable=download_info.value
            media_path=ROOT / (ENGINE + "-full-export-" + downloadable.suggested_filename)
            downloadable.save_as(str(media_path))
            # Simulate choosing the file that was actually downloaded to
            # iPhone Files. The app compares all bytes and checks playback;
            # nothing is sent to the network or GitHub.
            page.locator("#edit-saved-file").set_input_files(str(media_path))
            page.locator("#edit-saved-verify").click()
            page.wait_for_function("""() => /^(SAVED FILE VERIFIED|FILE MISMATCH|SAVED FILE CHECK FAILED)/.test(
              document.querySelector('#edit-saved-status')?.textContent||'')""",timeout=30000)
            saved_status=page.locator("#edit-saved-status").inner_text()
            if not saved_status.startswith("SAVED FILE VERIFIED"):
                REPORT["checks"]["saved_file_roundtrip"]="FAIL: "+saved_status
                raise AssertionError(saved_status)
            assert "byte-for-byte" in saved_status, "Verifier must explicitly prove content equality"
            REPORT["checks"]["saved_file_roundtrip"]="PASS: actual downloaded file matched original in-memory export byte-for-byte and played"
            # Same-size mutation is NOT the exported file: reject it even if
            # name, MIME extension, and byte count are unchanged.
            bad_path=ROOT/(ENGINE+"-corrupt-same-size.mp4")
            altered=bytearray(media_path.read_bytes())
            altered[-1]^=0x01
            bad_path.write_bytes(altered)
            page.locator("#edit-saved-file").set_input_files(str(bad_path))
            page.locator("#edit-saved-verify").click()
            page.wait_for_function("""() => /^(SAVED FILE VERIFIED|FILE MISMATCH|SAVED FILE CHECK FAILED)/.test(
              document.querySelector('#edit-saved-status')?.textContent||'')""",timeout=30000)
            wrong_status=page.locator("#edit-saved-status").inner_text()
            assert wrong_status.startswith("FILE MISMATCH"),"Corrupted same-size file was not rejected: "+wrong_status
            REPORT["checks"]["same_size_corruption_rejected"]="PASS"
            bad_path.unlink()
            metadata=json.loads(subprocess.check_output([
                "ffprobe","-v","error",
                "-show_entries","format=duration:stream=codec_type,codec_name,width,height",
                "-of","json",str(media_path)],text=True))
            assert any(st["codec_type"]=="video" and st.get("width")==720
                       and st.get("height")==1280 for st in metadata["streams"]),metadata
            assert any(st["codec_type"]=="audio" for st in metadata["streams"]),metadata
            # The app should report ACTUAL codec entries, not assume that
            # an MP4 extension implies H.264/AAC. Compare against ffprobe.
            page.wait_for_function("""() => !/^(Inspecting|No export)/.test(
              document.querySelector('#edit-social-status')?.textContent||'')""",timeout=15000)
            codec_ui=page.locator("#edit-social-status").inner_text()
            video_codecs=[st.get("codec_name") for st in metadata["streams"] if st.get("codec_type")=="video"]
            audio_codecs=[st.get("codec_name") for st in metadata["streams"] if st.get("codec_type")=="audio"]
            if "vp9" in video_codecs or "opus" in audio_codecs:
                assert codec_ui.startswith("SOCIAL CODEC WARNING"), (
                    "Actual VP9/Opus must be flagged before social upload: "+codec_ui)
                assert "VP9" in codec_ui or "Opus" in codec_ui,codec_ui
                REPORT["checks"]["social_codec_audit"]="PASS: warned on actual VP9/Opus MP4 (independently confirmed by ffprobe)"
            elif "h264" in video_codecs and "aac" in audio_codecs:
                assert codec_ui.startswith("BASIC CODEC MATCH"), (
                    "H264/AAC should show basic codec match, not guaranteed upload: "+codec_ui)
                REPORT["checks"]["social_codec_audit"]="PASS: H264/AAC basic match only, no upload guarantee"
            else:
                REPORT["checks"]["social_codec_audit"]="NOT VERIFIED: unusual codec combo "+codec_ui
            duration=metadata.get("format",{}).get("duration")
            if duration:
                assert 2.0<=float(duration)<=4.5,metadata
            REPORT["checks"]["full_edited_video_export"]="PASS: original browser video -> existing editor -> 720x1280 recording -> downloaded file"
            REPORT["full_export_media"]={"filename":downloadable.suggested_filename,
                  "duration":duration,"size_bytes":media_path.stat().st_size,
                  "stream_codecs":[{"type":st["codec_type"],"codec":st.get("codec_name","unknown")} for st in metadata["streams"]],
                  "social_upload_compatibility":"NOT VERIFIED: MP4 extension is not proof of H.264/AAC"}
        assert all(r["method"] == "GET" for r in requests), "No export test may dispatch a cloud render"
        visible_width(page)
        page.screenshot(path=str(ROOT / f"{ENGINE}-editor.png"), full_page=False)
        mobile_tab(page, "projects", "local-editor")
        expect(page.locator("#project-manager")).to_be_visible()
        REPORT["checks"]["projects_navigation"] = "PASS"

        page.locator('#mobile-nav [data-nav="home"]').click()
        expect(page.locator(".hero")).to_be_visible()
        visible_width(page)
        REPORT["checks"]["home_navigation"] = "PASS"
        REPORT["checks"]["javascript_errors"] = "PASS" if not errors else "FAIL"
        if errors:
            raise AssertionError("JavaScript page errors: " + str(errors))
        assert not any("/render" in r["url"] for r in requests)
        REPORT["mocked_api_calls"] = len(requests)
        print(json.dumps(REPORT, indent=2))
        context.close()
        browser.close()
except Exception as e:
    REPORT["error"] = str(e)
    REPORT["javascript_errors"] = errors
    print(json.dumps(REPORT, indent=2))
    raise
finally:
    (ROOT / f"report-{ENGINE}.json").write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    server.shutdown()
