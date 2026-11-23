"""V5.1 synthetic source -> real editor 3-second export -> decoded playback -> Files round-trip.
No user media, accounts, passwords, private uploads or social publish.
Headless Chromium is NOT physical iPhone Safari validation.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get("CUTNOVA_SMOKE_URL", "http://127.0.0.1:8765/")
ROOT=Path(__file__).resolve().parents[1]
MEDIA=ROOT/"smoke-artifacts"/"original-fixture.webm"
OUT=ROOT/"smoke-artifacts"
OUT.mkdir(parents=True,exist_ok=True)

def verify_export(browser,mobile):
    label="mobile-width" if mobile else "desktop"
    context=browser.new_context(
        viewport={"width":390 if mobile else 1366,"height":844 if mobile else 900},
        device_scale_factor=2 if mobile else 1, is_mobile=mobile,has_touch=mobile,
        accept_downloads=True,service_workers="block"
    )
    page=context.new_page()
    exceptions=[]
    page.on("pageerror",lambda error:exceptions.append(str(error)))
    try:
        response=page.goto(BASE+"#local-editor",wait_until="domcontentloaded",timeout=25000)
        assert response is not None and response.status==200,"Website must load"
        # Real browser records a synthetic 1-second video/audio probe.
        # Its actual codec entry, not MediaRecorder.isTypeSupported(), is the truth.
        page.locator("#edit-check-export").click()
        page.wait_for_function(
            """() => /RECORDED TEST CLIP|RECORDING FAILED/.test(
                document.querySelector('#edit-check-status')?.textContent||'')""",
            timeout=16000
        )
        assert "RECORDED TEST CLIP" in page.locator("#edit-check-status").inner_text(), (
            label+": synthetic codec probe recording failed: "+
            page.locator("#edit-check-status").inner_text()
        )
        page.wait_for_function(
            """() => /BASIC H\.264|H\.264\/AAC NOT VERIFIED|ACTUAL CODECS UNKNOWN|CODEC INSPECTION FAILED/.test(
              document.querySelector('#edit-check-codec')?.textContent||'')""",
            timeout=14000
        )
        actual=page.locator("#edit-check-codec").inner_text()
        result=page.locator("#edit-check-codec").get_attribute("data-result")
        print(label+" actual short media codec probe: "+actual)
        if "VP9" in actual or "Opus" in actual:
            assert result=="not-recommended", "MP4 + VP9/Opus must never pass H264/AAC"
            assert page.locator("#edit-check-use-strict").is_hidden(), "Unsafe strict option offered"
        elif "BASIC H.264" in actual:
            assert result=="basic-match", "Actual AVC + MP4 audio entry may be basic match"
        else:
            assert result=="unverified", "Unknown codec should not fake a pass"
        assert not page.locator("#edit-check-use-strict").is_enabled() or result=="basic-match"
        page.locator("#edit-file").set_input_files(str(MEDIA))
        page.locator("#edit-fields").wait_for(state="visible",timeout=18000)
        page.locator("#edit-end").fill("3")
        page.locator("#edit-rights").check()
        page.locator("#edit-export").wait_for(state="visible",timeout=12000)
        assert page.locator("#edit-export").is_enabled(),(
            label+": real export disabled: "+
            page.locator("#edit-format").inner_text()+"; "+page.locator("#edit-status").inner_text()
        )
        page.locator("#edit-export").click()
        try:
            page.wait_for_function(
                """() => {
                  const link=document.querySelector('#edit-download');
                  return !!link?.getAttribute('href')?.startsWith('blob:') &&
                    !document.querySelector('#edit-result').hidden;
                }""",timeout=60000
            )
        except Exception:
            raise AssertionError(label+": editor did not return a real export: "+
                page.locator("#edit-status").inner_text()+
                "; progress "+str(page.locator("#edit-progress").get_attribute("value")))
        qa=page.locator(".qa-row").filter(has=page.locator("strong",has_text="Actual editor export"))
        state=qa.locator(".qa-state").inner_text()
        assert state=="RECORDED","Expected actual export-ready event; got "+state
        assert "Recorded" in qa.inner_text() or "recorder" in qa.inner_text().lower()
        fmt=page.locator("#edit-social-status").inner_text()
        print(label+" export: "+page.locator("#edit-status").inner_text())
        print(label+" codec audit: "+fmt)
        page.locator("#edit-verify-playback").click()
        try:
            page.wait_for_function(
                """() => /LOCAL PLAYBACK (PASS|FAILED)/.test(
                  document.querySelector('#edit-verify-status')?.textContent||'')""",
                timeout=20000
            )
        except Exception:
            raise AssertionError(label+": export playback verifier timed out: "+
                page.locator("#edit-verify-status").inner_text())
        playback=page.locator("#edit-verify-status").inner_text()
        print(label+" playback result: "+playback)
        assert "LOCAL PLAYBACK PASS" in playback,label+": "+playback
        assert page.locator(".qa-row").filter(has=page.locator("strong",has_text="Export playback")).locator(".qa-state").inner_text()=="PASS"

        # A click-generated browser download is still not an iPhone Files save.
        with page.expect_download(timeout=20000) as pending:
            page.locator("#edit-download").click()
        download=pending.value
        saved=OUT/(label+"-generated"+(".mp4" if download.suggested_filename.lower().endswith(".mp4") else ".webm"))
        download.save_as(str(saved))
        assert saved.stat().st_size>1024, "Downloaded file must contain real bytes"
        page.locator("#edit-saved-file").set_input_files(str(saved))
        page.locator("#edit-saved-verify").click()
        page.wait_for_function(
          """() => /SAVED FILE (VERIFIED|CHECK FAILED)/.test(
            document.querySelector('#edit-saved-status')?.textContent||'')""",
          timeout=25000
        )
        saved_result=page.locator("#edit-saved-status").inner_text()
        print(label+" saved copy check: "+saved_result)
        assert "SAVED FILE VERIFIED" in saved_result,label+": "+saved_result
        assert page.locator(".qa-row").filter(has=page.locator("strong",has_text="Saved Files copy")).locator(".qa-state").inner_text()=="PASS"
        assert not exceptions,"Page JS errors: "+str(exceptions[:6])
        page.screenshot(path=str(OUT/(label+"-export-evidence.png")),full_page=True)
        print(label+" Chromium PASS — actual export, local playback and byte-matched downloaded file.")
    finally:
        context.close()

if __name__=="__main__":
    assert MEDIA.is_file(), "Use original synthetic fixture from browser-smoke.yml"
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            verify_export(browser,False)
            verify_export(browser,True)
        finally:
            browser.close()
    print("PASS synthetic local Chromium export workflow. iPhone Safari remains NOT TESTED.")
