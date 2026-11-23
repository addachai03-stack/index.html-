const assert=require("node:assert/strict");
const fs=require("node:fs");
const {
  frameDifference, planSampleTimes, candidateWindows, MAX_SCAN_SECONDS, MAX_SAMPLES
}=require("../local-highlights.js");

function rgba(r,g,b,n=16){
  const out=new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++){
    out.set([r,g,b,255],i*4);
  }
  return out;
}
const black=rgba(0,0,0),white=rgba(255,255,255);
assert.equal(frameDifference(black,black),0,"Unchanged scene has zero visual signal");
assert.equal(frameDifference(black,white),1,"Large RGB change yields maximum");
assert.equal(frameDifference(black,new Uint8ClampedArray([1,2,3])),0,"Invalid frames ignored");

const times=planSampleTimes(60);
assert.ok(times.length>=12&&times.length<=MAX_SAMPLES);
assert.ok(times[0]>=0.1&&times.at(-1)<60);
assert.deepEqual(planSampleTimes(0),[]);
const longTimes=planSampleTimes(3600);
assert.equal(MAX_SCAN_SECONDS,720);
assert.equal(longTimes.length,MAX_SAMPLES);
assert.ok(longTimes.at(-1)<=720);
assert.ok(longTimes.every((x,i)=>i===0||x>longTimes[i-1]));

const ranked=candidateWindows([
  {time:10,delta:.30},{time:11,delta:.28},
  {time:65,delta:.35},{time:110,delta:.45},{time:20,delta:.05}
],150,3,30);
assert.equal(ranked.length,3);
assert.equal(ranked[0].score,100);
assert.ok(ranked[0].signal.includes("not speech"));
for(const item of ranked){
  assert.ok(item.start>=0&&item.end<=150);
  assert.ok(item.end-item.start>=15&&item.end-item.start<=60);
  for(const other of ranked.filter(x=>x!==item)){
    assert.ok(item.end<=other.start+0.03||other.end<=item.start+0.03,"No overlapping review suggestions");
  }
}
assert.deepEqual(candidateWindows([{time:20,delta:.0001}],100,3,30),[],
  "Almost static video should not fabricate exciting moments");
assert.deepEqual(candidateWindows([{time:25,delta:0}],60,2,30),[]);
assert.deepEqual(candidateWindows([],60),[]);
const short=candidateWindows([{time:10,delta:.2}],20,3,30);
assert.equal(short.length,1);
assert.ok(short[0].end<=20);
assert.ok(candidateWindows([{time:20,delta:.2}],60,99,90).length<=6);
assert.deepEqual(candidateWindows([{time:-1,delta:.9},{time:3,delta:Infinity}],60),[]);

const html=fs.readFileSync("index.html","utf8");
const script=fs.readFileSync("local-highlights.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
for(const id of ["visual-finder","visual-scan","visual-stop","visual-status","visual-results","visual-count","visual-length"]){
  assert.ok(html.includes('id="'+id+'"'),id);
}
assert.ok(html.includes('src="./local-highlights.js"'));
assert.ok(sw.includes('"./local-highlights.js"'),"Source scanner cached offline");
assert.ok(pages.includes("local-highlights.js"),"Pages publishes scanner");
assert.ok(ci.includes("node tests/test_local_highlights.cjs"));
assert.ok(script.includes("rights.checked")&&script.includes("cutnova:open-cut"));
assert.ok(script.includes("URL.createObjectURL(source)"),"Local file only");
assert.ok(script.includes("URL.revokeObjectURL(objectURL)"),"Blob URL cleaned");
assert.ok(!script.includes("fetch(")&&!script.includes("getUserMedia("),
  "Scanner must never fetch/upload content or access microphone");
assert.ok(html.includes("not AI speech analysis"),"Honest visual-only feature labeling");
console.log("PASS: sampled scene differences, nonoverlapping windows, bounded scan, rights, no upload and PWA/Pages CI.");
