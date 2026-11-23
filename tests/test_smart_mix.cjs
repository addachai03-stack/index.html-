const assert=require("node:assert/strict");
const fs=require("node:fs");
const {combineSignals,sanitizeWindows,MAX_SCAN,MAX_AUDIO_BYTES}=require("../smart-mix.js");
function w(start,score,len=30){return {start,end:start+len,score};}

assert.equal(MAX_SCAN,180);
assert.equal(MAX_AUDIO_BYTES,20*1024*1024);
const visual=[w(0,80),w(42,75)];
const audio=[w(1,90),w(91,88)];
const fused=combineSignals(visual,audio,130,3,30);
assert.ok(fused.length>=2 && fused.length<=3);
assert.ok(fused[0].source==="Visual change + sound peak","Near-same-time visual and audio spikes should fuse");
assert.ok(fused[0].visual_score>0 && fused[0].audio_score>0);
for(const x of fused){
 assert.ok(x.start>=0 && x.end<=130 && x.score>=1 && x.score<=100);
 for(const y of fused.filter(y=>y!==x))
   assert.ok(x.end<=y.start+.03||y.end<=x.start+.03,"Never emit overlapping clips");
}
const visualOnly=combineSignals([w(5,60),w(45,90)],[],120,2,30);
assert.equal(visualOnly.length,2);
assert.ok(visualOnly.every(x=>x.source==="Visual changes"&&x.audio_score===0));
assert.equal(visualOnly[0].score,90);
const audioOnly=combineSignals([],[w(10,80)],90,3,30);
assert.equal(audioOnly.length,1);
assert.equal(audioOnly[0].source,"Audio energy peaks");
assert.equal(audioOnly[0].score,80);
assert.deepEqual(combineSignals([],[],90),[],"No invented candidates without changes");
assert.deepEqual(combineSignals([w(0,50)],[],14),[],"Short files do not qualify");
assert.deepEqual(combineSignals([w(-3,80),w(55,80)],[w(20,100)],60,3,30),
  combineSignals([],[w(20,100)],60,3,30),"Invalid time ranges excluded");
assert.deepEqual(sanitizeWindows([{start:0,end:50,score:100}],100,30),[],
 "Mismatched duration excluded");
assert.equal(combineSignals(Array.from({length:20},(_,i)=>w(i*30,100)),[],700,99,30).length,6,
 "Max six and only first six upstream public math candidates");
assert.equal(combineSignals([w(0,85)],[],120,1,30).length,1);
assert.deepEqual(combineSignals([w(0,NaN)],[],120),[]);

const html=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("smart-mix.js","utf8");
const visualJS=fs.readFileSync("local-highlights.js","utf8");
const audioJS=fs.readFileSync("audio-peaks.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
for(const id of ["smart-mix-panel","smart-mix-start","smart-mix-stop","smart-mix-status",
                 "smart-mix-results","smart-mix-count","smart-mix-length"])
 assert.ok(html.includes('id="'+id+'"'),"UI missing "+id);
assert.ok(html.includes('src="./smart-mix.js"'));
assert.ok(html.indexOf('src="./smart-mix.js"')>html.indexOf('src="./audio-peaks.js"'),
 "Smart Mix must load after Visual and Audio math");
assert.ok(visualJS.includes("root.CutNovaVisualMath=Object.freeze"),"Visual math must be shared");
assert.ok(audioJS.includes("root.CutNovaAudioMath=Object.freeze"),"Audio math must be shared");
assert.ok(js.includes("ctx.decodeAudioData(binary)")&&js.includes("URL.createObjectURL(file)"),
 "Local source frame and sound decode must really run");
assert.ok(js.includes("root.AudioContext||root.webkitAudioContext"),"WebAudio fallback");
assert.ok(js.includes("if(running)return")&&js.includes("ctx.close()"),"Prevent overlapping decode");
assert.ok(js.includes("rights.checked")&&js.includes("cutnova:open-cut"),
 "Rights-gated manual editor bridge");
assert.ok(!js.includes("fetch(")&&!js.includes("getUserMedia("),"No upload/network or microphone capture");
assert.ok(sw.includes('"./smart-mix.js"')&&!sw.includes('"./autolive/status.json"'));
assert.ok(pages.includes("smart-mix.js")&&ci.includes("node tests/test_smart_mix.cjs"));
assert.ok(html.includes("does NOT understand speech"),"No semantic video intelligence claim");
console.log("PASS: Smart Mix relative fusion, fallback, overlap bounds, no artificial candidates, privacy, iPhone and CI wiring.");
