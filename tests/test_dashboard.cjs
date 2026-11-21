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
    append() {}, replaceChildren() {}, scrollIntoView() {},
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
    'elements.style.value="facts"; elements.language.value="hi"; elements.crop.value="center"; elements.script.value="roman"; elements.captionStyle.value="yellow";' +
    'elements.rights.checked=true; updateRights();');
const request = new URL(document.getElementById("submit-request").href);
const body = request.searchParams.get("body");
for (const line of ["CLIPS: 3", "MIN_SECONDS: 15", "MAX_SECONDS: 45",
                   "STYLE: facts", "LANGUAGE: hi", "CROP: center", "CAPTION_SCRIPT: roman", "CAPTION_STYLE: yellow", "RIGHTS: YES"]) {
  assert.ok(body.split("\n").includes(line), "Missing " + line);
}
assert.equal(request.hostname, "github.com");
run('elements.min.value="60"; elements.max.value="30"; updateRights();');
assert.equal(document.getElementById("submit-request").href, "#");
assert.equal(document.getElementById("submit-request").attrs["aria-disabled"], "true");
run('elements.min.value="15"; elements.max.value="60"; elements.rights.checked=false; updateRights();');
assert.equal(document.getElementById("submit-request").href, "#");
const html = fs.readFileSync("index.html","utf8");
for (const id of ["highlight-style","speech-language","smart-crop","caption-script","caption-style"])
  assert.ok(html.includes('id="' + id + '"'), "Missing control " + id);
console.log("PASS: dashboard settings in GitHub issue, duration and rights guards, and control markup.");
