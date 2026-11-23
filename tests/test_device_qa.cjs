const assert=require("node:assert/strict");
const fs=require("node:fs");
const {
  initialEvidence,safeLine,captureFeatures,buildReport
}=require("../device-qa.js");

const statuses=initialEvidence();
assert.deepEqual(Object.keys(statuses),
 ["features","source","audio","export","playback","codec","files"]);
for(const item of Object.values(statuses))assert.equal(item.status,"NOT TESTED");
assert.ok(buildReport(statuses).includes("NOT TESTED"));
assert.ok(buildReport(statuses).includes("No private video or file names."));
assert.ok(!buildReport(statuses).includes("PASS: full export"));
assert.equal(safeLine("hello\nworld\t "), "hello world");
assert.equal(safeLine("A".repeat(100),10).length,10);

const supported={document:{createElement:()=>({captureStream(){}})},
 AudioContext:function(){},
 MediaRecorder:{isTypeSupported:t=>t==="video/mp4;codecs=avc1.424028,mp4a.40.2"}};
assert.deepEqual(captureFeatures(supported),{
 capture:true,audio:true,mime:"video/mp4;codecs=avc1.424028,mp4a.40.2",supported:true
});
assert.equal(captureFeatures(null).supported,false);
assert.equal(captureFeatures({...supported,document:{createElement:()=>({})}}).supported,false);
assert.equal(captureFeatures({...supported,MediaRecorder:{isTypeSupported:()=>false}}).supported,false);
assert.equal(captureFeatures({...supported,AudioContext:null}).supported,false);
assert.equal(captureFeatures({...supported,MediaRecorder:{isTypeSupported:()=>{throw Error("browser bug")}}}).supported,false);

const proof=initialEvidence();
proof.export={status:"RECORDED",detail:"Actual 20 KiB exported Blob."};
proof.playback={status:"PASS",detail:"720x1280 source played"};
proof.files={status:"NOT TESTED",detail:"no selected Files copy"};
const report=buildReport(proof);
assert.ok(report.includes("Editor: completed export event: RECORDED"));
assert.ok(report.includes("Export: actual 720x1280 video playback: PASS"));
assert.ok(report.includes("Selected Files copy: byte match and playback: NOT TESTED"));
assert.ok(report.includes("No audio audibility"));
assert.ok(!report.includes("SAVED FILE VERIFIED ✓"));

const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("device-qa.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const playback=fs.readFileSync("playback-check.js","utf8");
const saved=fs.readFileSync("saved-file-check.js","utf8");
const social=fs.readFileSync("social-codec-check.js","utf8");
for(const id of ["device-qa-panel","qa-heading","qa-run","qa-demo","qa-copy","qa-summary","qa-output"])
 assert.ok(html.includes('id="'+id+'"'),"missing UI "+id);
assert.ok(html.includes('src="./device-qa.js"'));
assert.ok(js.includes('root.addEventListener("cutnova:export-ready"'));
assert.ok(js.includes('root.addEventListener("cutnova:export-reset"'));
assert.ok(js.includes('root.addEventListener("cutnova:playback-check"'));
assert.ok(js.includes('root.addEventListener("cutnova:codec-check"'));
assert.ok(js.includes('root.addEventListener("cutnova:saved-file-check"'));
assert.ok(playback.includes('cutnova:playback-check'));
assert.ok(saved.includes('cutnova:saved-file-check'));
assert.ok(social.includes('cutnova:codec-check'));
assert.ok(js.includes("URL.revokeObjectURL(url)"),"Source URL cleaned");
assert.ok(js.includes("ctx.decodeAudioData(bytes)"),"Audio decode is real");
assert.ok(js.includes("ctx=new ctor()"),"AudioContext must be created in iPhone click");
assert.ok(js.includes("ctx.close()"),"Audio context cleanup required");
assert.ok(js.includes("root.navigator?.clipboard?.writeText"),"Copies report explicitly");
assert.ok(!js.includes("fetch(")&&!js.includes("getUserMedia(")&&!js.includes("localStorage"),"No external IO/mic or persisted data");
assert.ok(!js.includes("file.name+")&&!js.includes("file.name,"),"Report must not include media name");
assert.ok(sw.includes('"./device-qa.js"')&&!sw.includes('"./autolive/status.json"'));
assert.ok(ci.includes('node tests/test_device_qa.cjs')&&pages.includes('device-qa.js'));
assert.ok(fs.readFileSync("styles.css","utf8").includes(".qa-row"));
assert.ok(html.includes("API PASS only means")||html.includes("browser API PASS only means"),
 "Browser capability must not be presented as proof of export");
console.log("PASS: V5.0 honest status boundaries, privacy-safe evidence, real local decode, event integration, and Pages/PWA wiring.");
