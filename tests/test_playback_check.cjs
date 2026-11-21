const assert=require("node:assert/strict");
const fs=require("node:fs");
const {metadata,validPortrait,playbackProgress}=require("../playback-check.js");
assert.deepEqual(metadata({videoWidth:720,videoHeight:1280,duration:2.94}),{width:720,height:1280,duration:2.94});
assert.equal(validPortrait({videoWidth:720,videoHeight:1280,duration:2.94}),true);
assert.equal(validPortrait({videoWidth:1280,videoHeight:720,duration:2.94}),false);
assert.equal(validPortrait({videoWidth:720,videoHeight:1280,duration:NaN}),false);
assert.equal(validPortrait({videoWidth:720,videoHeight:1280,duration:0}),false);
assert.equal(playbackProgress(0,0.26),true);
assert.equal(playbackProgress(1.5,1.65),false);
assert.equal(playbackProgress(NaN,1),false);
const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
for(const id of ["edit-verify-playback","edit-verify-status","edit-download","edit-output"])
 assert.ok(html.includes('id="'+id+'"'),"Missing playback control "+id);
assert.ok(html.includes('src="./playback-check.js"'));
assert.ok(sw.includes('"./playback-check.js"'),"offline playback verifier must be cached");
assert.ok(!fs.readFileSync("playback-check.js","utf8").includes("localStorage"));
console.log("PASS: playback test checks real decoded portrait video and progress, never claims Files save or uploads.");
