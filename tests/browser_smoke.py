"""CutNova V5.0 read-only UI smoke test in headless Chromium.
This is NOT iPhone/Safari validation; all media is an original FFmpeg fixture.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("CUTNOVA_SMOKE_URL", "http://127.0.0.1:8765/")
ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "smoke-artifacts" / "original-fixture.mp4"
OUT = ROOT / "smoke-artifacts"
OUT.mkdir(parents=True, exist_ok=True)

def row_status(page, label):
    row = page.locator(".qa-row").filter(has=page.locator("strong", has_text=label))
    assert row.count() == 1, "Missing/duplicate evidence row: " + label
    return row.locator(".qa-state").inner_text()

def check(browser, mobile):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1366, "height": 844 if mobile else 900},
        is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1,
        service_workers="block", # smoke current source, not stale offline cache
    )
    page = context.new_page()
    errors=[]
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        response = page.goto(BASE, wait_until="domcontentloaded", timeout=25000)
        assert response is not None and response.status == 200, "Homepage HTTP 200 missing"
        page.locator("#mobile-nav").wait_for(state="attached", timeout=10000)
        if mobile:
            page.locator('#mobile-nav [data-nav="editor"]').click()
        else:
            page.goto(BASE + "#local-editor", wait_until="domcontentloaded")
        page.locator("#qa-run").wait_for(state="visible", timeout=10000)
        assert page.locator(".qa-row").count() == 7, "Seven independent evidence rows expected"
        assert row_status(page, "Source video") == "NOT TESTED"
        assert row_status(page, "Saved Files copy") == "NOT TESTED"
        page.locator("#qa-run").click()
        page.wait_for_function(
            """() => document.querySelector('#qa-summary').textContent.includes('Local checks completed.')""",
            timeout=20000,
        )
        assert row_status(page, "Source video") == "NOT TESTED", "No selected video must not auto-PASS"
        assert row_status(page, "Audio decode") == "NOT TESTED", "No selected audio must not auto-PASS"
        assert row_status(page, "Actual editor export") == "NOT TESTED", "No fake export"
        assert row_status(page, "Export playback") == "NOT TESTED", "No fake playback"
        assert row_status(page, "Saved Files copy") == "NOT TESTED", "No fake Files save"
        print(("MOBILE" if mobile else "DESKTOP") + " Chromium: no-media PASS (no fabricated capabilities)")

        if mobile:
            page.locator('#mobile-nav [data-nav="ai"]').click()
        else:
            page.goto(BASE + "#studio", wait_until="domcontentloaded")
        page.locator("#quick-file").set_input_files(str(MEDIA))
        if mobile:
            page.locator('#mobile-nav [data-nav="editor"]').click()
        else:
            page.goto(BASE + "#local-editor", wait_until="domcontentloaded")
        page.locator("#qa-run").click()
        page.wait_for_function(
            """() => document.querySelector('#qa-summary').textContent.includes('Local checks completed.')""",
            timeout=45000,
        )
        src = row_status(page, "Source video")
        audio = row_status(page, "Audio decode")
        assert src == "PASS", "Original fixture should decode a real video frame, got " + src
        assert audio in ("PASS", "FAIL"), "Audio must be attempted and have a real outcome, got " + audio
        assert row_status(page, "Actual editor export") == "NOT TESTED", "No media was exported"
        assert row_status(page, "Saved Files copy") == "NOT TESTED", "No Files save was completed"
        assert page.locator("#qa-copy").is_visible()
        assert page.locator("#qa-demo").is_visible()
        assert page.locator("#edit-prepare-test").count() == 1
        assert page.locator("#edit-export").count() == 1
        assert page.locator("#edit-saved-verify").count() == 1
        name = "mobile-chromium" if mobile else "desktop-chromium"
        page.screenshot(path=str(OUT / (name + "-evidence.png")), full_page=True)
        assert not errors, "Uncaught page JS errors: " + "; ".join(errors[:5])
        print(name + ": source decoded PASS; audio decode " + audio +
              "; export/playback/Files NOT TESTED (correct). No upload or recorded export.")
    finally:
        context.close()

if __name__ == "__main__":
    assert MEDIA.is_file(), "Original test fixture missing; see browser-smoke.yml"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            check(browser, True)
            check(browser, False)
        finally:
            browser.close()
    print("PASS: CutNova V5.0 source decode and honest readiness UI in simulated mobile and desktop Chromium.")
