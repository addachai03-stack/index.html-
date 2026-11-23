const fs = require("node:fs");
const assert = require("node:assert/strict");
const {normalizeTarget,safeClipURL,freshness} = require("../autolive.js");

assert.deepEqual(normalizeTarget("twitch","Streamer_Name"),{platform:"twitch",channel:"streamer_name"});
assert.deepEqual(normalizeTarget("youtube","@creator"),{platform:"youtube",channel:"@creator"});
for(const value of ["https://twitch.tv/name","../private","oops?key=secret","hi there"]){
  assert.throws(()=>normalizeTarget("twitch",value));
}
assert.equal(safeClipURL("https://clips.twitch.tv/GoodSlug"),"https://clips.twitch.tv/GoodSlug");
for(const uri of ["javascript:alert(1)","https://twitch.tv.evil.example/clip","http://clips.twitch.tv/foo"]){
  assert.equal(safeClipURL(uri),null,uri);
}
const now=Date.parse("2026-11-23T12:00:00Z");
assert.equal(freshness({checked_at:"2026-11-23T11:30:00Z"},now),"current");
assert.equal(freshness({checked_at:"2026-11-23T07:00:00Z"},now),"stale");

const html=fs.readFileSync("autolive.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
for(const id of ["live-platform","live-channel","live-save","live-refresh","live-state","live-clips","live-rights"]){
  assert.ok(html.includes('id="'+id+'"'),id);
}
assert.ok(index.includes('href="./autolive.html"'));
assert.ok(sw.includes('"./autolive.html"')&&sw.includes('"./autolive.js"'));
assert.ok(!sw.includes('"./autolive/status.json"'),"Live data must never be cached offline as if fresh");
assert.ok(html.includes("https://raw.githubusercontent.com"),"Public status source allowed by CSP");
assert.ok(fs.readFileSync("autolive.js","utf8").includes("raw.githubusercontent.com/addachai03-stack/index.html-/main/autolive/status.json"),"Reads latest status despite Pages lag");
assert.ok(pages.includes("autolive.html")&&pages.includes("autolive.js")&&pages.includes("cp -r autolive _site/"));
assert.ok(html.includes("not enabled"),"Do not falsely claim auto clip recording is live");
console.log("PASS: Auto Live input validation, safe URLs, stale-state checks, UI assets and honest feature labeling.");
