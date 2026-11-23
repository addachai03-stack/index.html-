const assert=require("node:assert/strict");
const fs=require("node:fs");
const {officialClipURL,normalizeMoment,cleanQueue,postingDraft,reviewPlan}=require("../moment_queue.js");

const sample={
  id:"GreatClip",url:"https://clips.twitch.tv/GreatClip",title:"Amazing streamer moment",
  created_at:"2026-11-23T11:30:00Z",duration:30,view_count:250,review_score:88,
  review_reasons:["Most views in this fetched sample","15–60 second clip"]
};
assert.equal(officialClipURL(sample.url),sample.url);
for(const bad of [
  "javascript:alert(1)","https://clips.twitch.tv.evil.example/GreatClip",
  "https://clips.twitch.tv/GreatClip?token=secret",
  "https://user:pass@clips.twitch.tv/GreatClip",
  "http://clips.twitch.tv/GreatClip",
  "https://clips.twitch.tv/../private"
])assert.equal(officialClipURL(bad),null,bad);
assert.ok(normalizeMoment(sample));
assert.equal(normalizeMoment({...sample,duration:99}),null);
assert.equal(normalizeMoment({...sample,review_score:101}),null);
assert.equal(normalizeMoment({...sample,id:"../oops"}),null);
assert.equal(normalizeMoment({...sample,url:"https://evil.example/hi"}),null);
const xss=normalizeMoment({...sample,title:"<script>alert(1)</script>\ntext"});
assert.ok(xss.title.includes("<script>"));
assert.ok(!xss.title.includes("\n"),"External title is treated as text, never interpreted as markup");
const item={...sample,platform:"twitch",channel:"streamer"};
assert.equal(cleanQueue([item,item]).length,1,"Deduplicate same clip");
assert.equal(cleanQueue([{...item,channel:"../../../oops"}]).length,0);
assert.equal(cleanQueue(Array.from({length:30},(_,i)=>({...item,id:"Clip"+i}))).length,20);
const draft=postingDraft(sample);
assert.ok(draft.includes(sample.url)&&draft.includes("Check context"));
assert.ok(!draft.toLowerCase().includes("auto-post complete"));
assert.throws(()=>postingDraft({}));
assert.ok(reviewPlan([item]).includes("Metadata-ranked"));
assert.throws(()=>reviewPlan([]));

const html=fs.readFileSync("autolive.html","utf8");
const js=fs.readFileSync("autolive.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const monitor=fs.readFileSync("live_monitor.py","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
for(const id of ["moment-list","moment-queue","moment-count","moment-status","moment-draft","queue-download","queue-clear","moment-copy"]){
  assert.ok(html.includes('id="'+id+'"'),id);
}
assert.ok(html.includes('src="./moment_queue.js"'));
assert.ok(js.includes('cutnova:live-status'));
assert.ok(sw.includes('"./moment_queue.js"'));
assert.ok(!sw.includes('"./autolive/status.json"'),"Public live status must not be cached as offline data");
assert.ok(pages.includes("moment_queue.js"));
assert.ok(ci.includes("node tests/test_moment_queue.cjs")&&ci.includes("moment_rank.py"));
assert.ok(monitor.includes("rank_public_moments"));
assert.ok(html.includes("NOT VIDEO AI"),"Must make no content-analysis claim");
console.log("PASS: moment queue validation, safe draft output, limits, review UI and CI/PWA wiring");
