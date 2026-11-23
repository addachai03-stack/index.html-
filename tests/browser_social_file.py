"""V5.2 local file picker proof: H.264/mp4a MP4 accepted only as BASIC,
VP9/Opus inside .mp4 rejected, with no network upload or fake playback PASS.
Synthetic local fixtures only. NOT a real iPhone Safari test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"smoke-artifacts"
GOOD=OUT/"verified-h264-aac.mp4"
BAD=OUT/"incompatible-vp9-opus.mp4"
BASE="http://127.0.0.1:8765/"

def check(browser,mobile):
    label="mobile-width" if mobile else "desktop"
    ctx=browser.new_context(
        viewport={"width":390 if mobile else 1366,"height":844 if mobile else 900},
        device_scale_factor=2 if mobile else 1,is_mobile=mobile,has_touch=mobile,
        service_workers="block"
    )
    page=ctx.new_page()
    exceptions=[]
    page.on("pageerror",lambda err:exceptions.append(str(err)))
    try:
        response=page.goto(BASE+"#local-editor",wait_until="domcontentloaded",timeout=25000)
        assert response and response.status==200
        inp=page.locator("#social-file-input")
        inp.set_input_files(str(GOOD))
        status=page.locator("#social-file-status")
        assert status.get_attribute("data-result")=="not-tested"
        page.locator("#social-file-check").click()
        page.wait_for_function(
            "() => document.querySelector('#social-file-status').dataset.result === 'basic-match'",
            timeout=20000
        )
        actual=status.inner_text()
        assert "H.264" in actual and "NOT verified" in actual
        assert "This tool did not convert" in actual
        assert page.locator("#social-file-play").is_enabled()
        assert "PLAYBACK NOT VERIFIED" in page.locator("#social-file-play-status").inner_text()
        print(label+" original synthetic H264+MP4 audio entries: BASIC MATCH, playback NOT TESTED")

        inp.set_input_files(str(BAD))
        assert status.get_attribute("data-result")=="not-tested","Changing file resets old success"
        page.locator("#social-file-check").click()
        page.wait_for_function(
            "() => document.querySelector('#social-file-status').dataset.result === 'not-recommended'",
            timeout=20000
        )
        assert "NOT A VERIFIED" in status.inner_text()
        print(label+" VP9/Opus MP4 mismatch: NOT RECOMMENDED (not mislabeled H264)")
        assert not exceptions,"JS page errors: "+str(exceptions)
        page.screenshot(path=str(OUT/(label+"-social-format-evidence.png")),full_page=True)
    finally:
        ctx.close()

if __name__=="__main__":
    assert GOOD.is_file() and BAD.is_file(), "Synthetic codec fixtures were not generated"
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            check(browser,False)
            check(browser,True)
        finally:browser.close()
    print("PASS local H264/mp4a basic matching and VP9/Opus rejection. Physical iPhone not tested.")
