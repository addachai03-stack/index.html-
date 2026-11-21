import json,os,subprocess,threading,time
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
root=Path("release-proof");root.mkdir(exist_ok=True)
sample=root/"sample.mp4"
subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","testsrc2=size=320x240:rate=25:duration=4","-f","lavfi","-i","sine=frequency=440:duration=4","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",str(sample)],check=True)
server=ThreadingHTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f"http://127.0.0.1:{server.server_port}/"
engine=os.environ.get("ENGINE","chromium")
report={"browser":engine,"physical_iphone":False,"checks":{},"revision":"V3.5 end-to-end offline phone editor, generated MP4/WebM file verification", "physical_iphone":False, "external_ai_render_started":False}
def wait_media(page):
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        # A direct evaluation of a property, not wait_for_function's string eval.
        if page.locator("#edit-video").evaluate("(el) => el.readyState")>=2:
            return
        time.sleep(.2)
    raise AssertionError("Source frame unavailable: "+page.locator("#edit-status").inner_text())

with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    context=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    # Owner authentication has its own tested workflow. The local file editor
    # does not need Cloudflare, so omit only owner-render.js from the *local
    # test browser* to avoid testing localhost against production CORS policy.
    # The production JS file is NOT changed or removed from CutNova.
    page.route("**/owner-render.js",lambda route:route.fulfill(
        status=200,content_type="application/javascript",
        body="/* Owner render intentionally isolated in offline export QA only */"))
    report["checks"]["owner_gateway_isolated"]="PASS"
    try:
        page.goto(url,wait_until="domcontentloaded")
        expect(page.locator("#pwa-status")).to_contain_text("Offline app shell ready",timeout=30000)
        # Check the bypass route stays reachable and returns to the latest UI.
        page.goto(url+"refresh.html",wait_until="domcontentloaded")
        page.locator("#repair-button").click()
        expect(page.locator("#quick-generate")).to_be_visible(timeout=30000)
        report["checks"]["pwa_manual_update"]="PASS"
        report["checks"]["service_worker"]="PASS"
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-nav="ai"]').click()
        page.locator("#quick-file").wait_for()
        report["checks"]["offline_reload"]="PASS"
        page.locator("#quick-file").set_input_files(str(sample))
        page.locator("#quick-rights").check()
        page.locator("#quick-generate").click()
        expect(page.locator(".quick-cut")).to_have_count(1,timeout=30000)
        report["checks"]["in_app_quick_generation"]="PASS"
        page.locator(".quick-cut button").click()
        page.locator("#edit-fields").wait_for(timeout=20000)
        wait_media(page)
        report["checks"]["quick_cut_editor_import"]="PASS"
        page.locator("#edit-end").fill("3")
        page.locator("#edit-text").fill("Release proof")
        page.locator('[data-nav="projects"]').click()
        page.locator("#edit-draft-title").fill("Offline test")
        page.locator("#edit-draft-save").click()
        expect(page.locator("#edit-draft-status")).to_contain_text("Saved on this device",timeout=20000)
        report["checks"]["offline_draft_save"]="PASS"
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-nav="projects"]').click()
        page.get_by_role("button",name="RESUME",exact=True).click()
        expect(page.locator("#edit-text")).to_have_value("Release proof",timeout=20000)
        wait_media(page)
        report["checks"]["offline_draft_resume"]="PASS"
        page.locator('[data-nav="editor"]').click()
        page.locator("#edit-rights").check()
        assert not page.locator("#edit-export").is_disabled() or "export not supported" in page.locator("#edit-format").inner_text().lower(), "Export disabled without a clear browser support explanation"
        if page.locator("#edit-export").is_disabled():
            report["checks"]["recording"]="NOT SUPPORTED: "+page.locator("#edit-format").inner_text()
            report["checks"]["export_support_message"]="PASS"
        else:
            page.locator("#edit-export").click()
            page.locator("#edit-result").wait_for(timeout=40000)
            with page.expect_download() as info:
                page.locator("#edit-download").click()
            download=info.value
            out=root/download.suggested_filename
            download.save_as(str(out))
            media=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries","stream=codec_type,width,height:format=duration","-of","json",str(out)]))
            assert any(s["codec_type"]=="video" and s["width"]==720 and s["height"]==1280 for s in media["streams"]),media
            assert any(s["codec_type"]=="audio" for s in media["streams"]),media
            # WebM live recordings may not carry a duration in container headers.
            if "duration" in media.get("format",{}):
                duration=float(media["format"]["duration"]);assert 1.8<=duration<=5,media
            report["checks"]["recording"]="PASS";report["checks"]["export_download"]="PASS";report["media"]=media
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"), "Mobile editor has horizontal overflow"
        report["checks"]["no_horizontal_overflow"]="PASS"
        page.screenshot(path=str(root/"editor.png"),full_page=True)
        assert not errors,errors
        report["checks"]["javascript"]="PASS"
    except Exception as e:
        report["error"]=str(e);report["page_errors"]=errors
        page.screenshot(path=str(root/"failure.png"),full_page=True)
        raise
    finally:
        (root/"report.json").write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
        browser.close()
        server.shutdown()
