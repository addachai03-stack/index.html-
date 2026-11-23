const assert=require("node:assert/strict");
const fs=require("node:fs");
const {energySeries,peakWindows,MAX_AUDIO_BYTES,MAX_AUDIO_SECONDS}=require("../audio-peaks.js");

function buffer(levels,rate=1000){
 const frames=Math.round(rate*.5),values=new Float32Array(frames*levels.length);
 for(let i=0;i<levels.length;i++)values.fill(levels[i],i*frames,(i+1)*frames);
 return {sampleRate:rate,duration:levels.length*.5,length:values.length,
   numberOfChannels:1,getChannelData(channel){assert.equal(channel,0);return values;}};
}
assert.equal(MAX_AUDIO_BYTES,20*1024*1024);
assert.equal(MAX_AUDIO_SECONDS,180);
const silence=energySeries(buffer(Array(40).fill(0)));
assert.equal(silence.length,40);
assert.equal(silence[0].energy,0);
assert.deepEqual(peakWindows(silence,20),[]);
const constant=energySeries(buffer(Array(80).fill(.4)));
assert.deepEqual(peakWindows(constant,40),[],"Constant loud music should not invent highlights");
const levels=Array(240).fill(.04);
levels[28]=.85;levels[29]=.7;levels[102]=.9;levels[174]=.8;
const energy=energySeries(buffer(levels));
assert.equal(energy.length,240);
const best=peakWindows(energy,120,3,30);
assert.equal(best.length,3);
assert.equal(best[0].score,100);
assert.ok(best.every(x=>x.score>0&&x.score<=100));
assert.ok(best.every(x=>x.signal.includes("not speech recognition")));
for(let i=0;i<best.length;i++){
 assert.ok(best[i].start>=0&&best[i].end<=120);
 assert.equal(Math.round(best[i].end-best[i].start),30);
 for(let j=i+1;j<best.length;j++)
   assert.ok(best[i].end<=best[j].start+.02||best[j].end<=best[i].start+.02,
     "No overlapping audio picks");
}
assert.equal(peakWindows(energy,120,1,45).length,1);
assert.equal(peakWindows(energy,120,99,15).length<=6,true);
assert.deepEqual(peakWindows([],120,3,30),[]);
assert.deepEqual(peakWindows([{time:5,energy:Infinity}],120,3,30),[]);
assert.deepEqual(peakWindows([{time:1,energy:.8}],10,3,30),[],"Short videos not supported");
assert.deepEqual(energySeries({sampleRate:0,duration:20,numberOfChannels:1,getChannelData(){return []}}),[]);
assert.deepEqual(energySeries(null),[]);

const html=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("audio-peaks.js","utf8");
const sw=fs.readFileSync("sw.js","utf8"),pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
for(const id of ["audio-peaks-panel","audio-peaks-source","audio-peaks-start","audio-peaks-cancel",
                 "audio-peaks-status","audio-peaks-results","audio-peaks-count","audio-peaks-length"])
 assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
assert.ok(html.includes('src="./audio-peaks.js"'));
assert.ok(sw.includes('"./audio-peaks.js"'),"Audio scanner cached as public JS, not source media");
assert.ok(pages.includes("audio-peaks.js"),"Deployment must include audio scanner");
assert.ok(ci.includes("node tests/test_audio_peaks.cjs"));
assert.ok(js.includes("rights.checked")&&js.includes('cutnova:open-cut'));
assert.ok(js.includes("source.arrayBuffer()")&&js.includes("ctx.decodeAudioData(bytes)"));
assert.ok(js.includes("root.AudioContext||root.webkitAudioContext"),"iOS legacy support");
assert.ok(js.includes("ctx=new AudioContextClass()"),"AudioContext initialized by user click");
assert.ok(js.includes("await ctx.close()"),"Audio decoder closed after completion");
assert.ok(!js.includes("fetch(")&&!js.includes("getUserMedia("),
  "No media upload or microphone access");
assert.ok(html.includes("cannot understand speech"),"No semantic AI claim");
console.log("PASS: local audio energy peaks, silence, clipping bounds, rights, iPhone memory/codec fallback, no upload.");
