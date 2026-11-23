const assert=require("node:assert/strict");
const fs=require("node:fs");
const {acceptedSize,formatVerdict,validPortraitMetadata,MAX_BYTES}=require("../social-file-verify.js");
assert.equal(MAX_BYTES,250*1024*1024);
assert.equal(acceptedSize({size:1024}),true);
assert.equal(acceptedSize({size:MAX_BYTES}),true);
assert.equal(acceptedSize({size:MAX_BYTES+1}),false);
assert.equal(acceptedSize({size:0}),false);
assert.equal(acceptedSize(null),false);

const good={container:"MP4",video:["avc1"],audio:["mp4a"],incomplete:false};
assert.equal(formatVerdict(good).code,"basic-match");
assert.ok(formatVerdict(good).text.includes("NOT verified"));
assert.equal(formatVerdict({...good,video:["avc3"]}).code,"basic-match");
for(const info of [
  {container:"MP4",video:["vp09"],audio:["Opus"],incomplete:false},
  {container:"MP4",video:["avc1"],audio:["Opus"],incomplete:false},
  {container:"MP4",video:["avc1"],audio:[],incomplete:false},
  {container:"MP4",video:["avc1"],audio:["mp4a"],incomplete:true},
  {container:"WebM",video:["avc1"],audio:["mp4a"],incomplete:false},
  null
])assert.equal(formatVerdict(info).code,"not-recommended","unsupported codec should never pass");

assert.equal(validPortraitMetadata({duration:3,videoWidth:720,videoHeight:1280}),true);
assert.equal(validPortraitMetadata({duration:65,videoWidth:1080,videoHeight:1920}),true);
assert.equal(validPortraitMetadata({duration:3,videoWidth:1280,videoHeight:720}),false);
assert.equal(validPortraitMetadata({duration:NaN,videoWidth:720,videoHeight:1280}),false);
assert.equal(validPortraitMetadata({duration:66,videoWidth:720,videoHeight:1280}),false);

const html=fs.readFileSync("index.html","utf8");
const code=fs.readFileSync("social-file-verify.js","utf8");
const codecs=fs.readFileSync("social-codec-check.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const pages=fs.readFileSync(".github/workflows/pages.yml","utf8");
const ci=fs.readFileSync(".github/workflows/checks.yml","utf8");
for(const id of ["social-file-panel","social-file-input","social-file-check","social-file-play",
 "social-file-status","social-file-preview","social-file-play-status","social-file-audio","social-file-audio-status","social-file-audio-heard","social-file-audio-silent","social-file-report","social-file-report-status","social-file-report-download"])
 assert.ok(html.includes('id="'+id+'"'),"Missing UI "+id);
assert.ok(html.includes("Shortcuts")&&html.includes("Encode Media")&&html.includes("Audio Only OFF"),
  "Native private conversion instructions must not claim actual conversion");
assert.ok(html.includes('src="./social-file-verify.js"'));
assert.ok(codecs.includes("root.CutNovaCodecAudit=Object.freeze({inspect,classify,label,honorsStrictSocialRequest})"));
assert.ok(code.includes("engine.inspect(file)"),"Inspect real selected file bytes, not filename");
assert.ok(code.includes("URL.createObjectURL(file)")&&code.includes("URL.revokeObjectURL(objectURL)"));
assert.ok(code.includes("player.play()")&&code.includes("waitToAdvance(start,version)"));
assert.ok(code.includes("player.muted=false")&&code.includes("player.volume=1"));
assert.ok(code.includes("setAudioConfirmation(true)")&&code.includes("setAudioConfirmation(false)"));
assert.ok(code.includes("needs-user-confirmation")&&code.includes("user-heard")&&code.includes("user-no-sound"));
assert.ok(code.includes("cannot detect audible sound")&&code.includes("manual listening result"));
assert.ok(!code.includes("audioStatus.dataset.result=\"pass\""),"No auto-pass audio label");
assert.ok(code.includes("LOCAL SHARE PREPARATION CHECKLIST")&&code.includes("file name omitted"));
assert.ok(code.includes("status.dataset.result===\"basic-match\"")&&code.includes("playbackStatus.dataset.result===\"pass\""));
assert.ok(code.includes("audioStatus.dataset.result===\"user-heard\"")&&code.includes("audioStatus.dataset.result===\"user-no-sound\""));
assert.ok(code.includes("This is a local checklist, not a transcode")&&code.includes("destination app's current upload requirements"));
assert.ok(code.includes("URL.createObjectURL(blob)")&&code.includes("URL.revokeObjectURL(reportDownload.dataset.url)"));
assert.ok(!code.includes("fetch(")&&!code.includes("navigator.share("),"Report generation must remain local and must not upload/share automatically");
assert.ok(!code.includes("fetch(")&&!code.includes("getUserMedia(")&&!code.includes("localStorage"));
assert.ok(!code.includes("file.name+")&& !code.includes("file.name,"));
assert.ok(sw.includes('"./social-file-verify.js"')&&!sw.includes('"./autolive/status.json"'));
assert.ok(pages.includes("social-file-verify.js")&&ci.includes("node tests/test_social_file_verify.cjs"));
console.log("PASS private converted video proof: H264 basic match, VP9/Opus reject, local playback guard, PWA, no upload.");
