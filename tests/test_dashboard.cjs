// Verify that the actual mobile dashboard sends its chosen render settings to GitHub.
// No network, private data, or browser dependencies are needed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function node() {
  return {
    value: "", checked: false, hidden: false, href: "#",
    handlers: {}, attrs: {},
    classList: {toggle() {}},
    addEventListener(name, callback) { this.handlers[name] = callback; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append() {}, replaceChildren() {}, scrollIntoView() {}, focus() {},
  };
}
const map = new Map();
const document = {getElementById(id) {
  if (!map.has(id)) map.set(id, node());
  return map.get(id);
}, createElement: node};
const ctx = vm.createContext({document, URL, URLSearchParams,
  location: {search: ""}, console});
vm.runInContext(fs.readFileSync("app.js", "utf8"), ctx);
const run = code => vm.runInContext(code, ctx);
run('current = providerFor("https://remotion.media/video-1m.mp4");' +
    'elements.clips.value="3"; elements.min.value="15"; elements.max.value="45";' +
    'elements.style.value="facts"; elements.language.value="hi"; elements.crop.value="center"; elements.script.value="roman"; elements.captionStyle.value="yellow"; elements.pacing.value="tight";' +
    'elements.rights.checked=true; updateRights();');
const primary=document.getElementById("submit-request");
assert.equal(primary.disabled,false,"Local action enabled after rights confirmation");
assert.equal(primary.href,"#","Primary button must never navigate away");
const request = new URL(document.getElementById("owner-github-render").href);
const body = request.searchParams.get("body");
for (const line of ["CLIPS: 3", "MIN_SECONDS: 15", "MAX_SECONDS: 45",
                   "STYLE: facts", "LANGUAGE: hi", "CROP: center", "CAPTION_SCRIPT: roman", "CAPTION_STYLE: yellow", "PACING: tight", "RIGHTS: YES"]) {
  assert.ok(body.split("\n").includes(line), "Missing " + line);
}
assert.equal(request.hostname, "github.com");
run('elements.min.value="60"; elements.max.value="30"; updateRights();');
assert.equal(document.getElementById("submit-request").disabled, true);
assert.equal(document.getElementById("submit-request").attrs["aria-disabled"], "true");
run('elements.min.value="15"; elements.max.value="60"; elements.rights.checked=false; updateRights();');
assert.equal(document.getElementById("submit-request").disabled, true);
const html = fs.readFileSync("index.html","utf8");
for (const id of ["highlight-style","speech-language","smart-crop","caption-script","caption-style","pacing"])
  assert.ok(html.includes('id="' + id + '"'), "Missing control " + id);
const local=vm.runInContext("cutWindows(60,3,15)",ctx);
assert.equal(local.length,3);
assert.deepEqual(JSON.parse(JSON.stringify(local.map(c=>[c.start,c.end]))),[[0,15],[22.5,37.5],[45,60]]);
assert.equal(vm.runInContext("cutWindows(6,6,15).length",ctx),1);
assert.ok(html.includes('id="quick-generate"')&&html.includes('id="quick-file"'));
assert.ok(html.includes('id="owner-render-tools"'));
assert.ok(!html.includes('id="submit-request" class="btn btn-lime disabled-link"'));
// Cloud AI quick-start must select fixture, not automatically confirm rights or dispatch work.
document.getElementById("rights-confirm").checked=false;
document.getElementById("load-ai-test-video").handlers.click();
assert.equal(document.getElementById("video-url").value,"https://remotion.media/video-1m.mp4");
assert.equal(document.getElementById("clips-count").value,"2");
assert.equal(document.getElementById("min-seconds").value,"30");
assert.equal(document.getElementById("max-seconds").value,"30");
assert.equal(document.getElementById("rights-confirm").checked,false,"Sample selection must not automatically accept content rights");
assert.equal(document.getElementById("owner-render-tools").open,true);
assert.match(document.getElementById("message").textContent,/No render has started/i);
console.log("PASS: safe AI MP4 fixture selection with 2x30s, correct rights checkbox and no automatic render.");
console.log("PASS: primary on-device generation, timed cut bounds, owner-only advanced route and rights guards.");
