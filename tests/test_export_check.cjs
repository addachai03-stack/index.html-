const assert=require("node:assert/strict");
const fs=require("node:fs");
const {capabilities,unsupportedReason,probeDecision}=require("../export-check.js");
function webWindow({capture=true,recorder=true,audio=true,mime="video/webm"}={}){
  function Recorder(){}
  Recorder.isTypeSupported=t=>t===mime;
  const canvas={getContext:()=>({}),captureStream:capture?()=>({}):undefined};
  return {
    document:{createElement:()=>canvas},
    MediaRecorder:recorder?Recorder:undefined,
    AudioContext:audio?function AudioContext(){}:undefined,
  };
}
const okay=capabilities(webWindow());
assert.equal(okay.supported,true);
assert.equal(okay.mime,"video/webm");
assert.equal(unsupportedReason(okay),"");
assert.match(unsupportedReason(capabilities(webWindow({capture:false}))),/captureStream/);
assert.match(unsupportedReason(capabilities(webWindow({recorder:false}))),/MediaRecorder/);
assert.match(unsupportedReason(capabilities(webWindow({audio:false}))),/Web Audio/);
assert.match(unsupportedReason(capabilities(webWindow({mime:"video/unsupported"}))),/codec/);
assert.equal(capabilities({document:{createElement:()=>({getContext:()=>null})}}).supported,false);
const h264={container:"MP4",video:["avc1"],audio:["mp4a"],incomplete:false};
const vp9={container:"MP4",video:["vp09"],audio:["Opus"],incomplete:false};
const webm={container:"WebM",video:[],audio:[],incomplete:true};
const strictMime="video/mp4;codecs=avc1.42001f,mp4a.40.2";
assert.deepEqual(probeDecision(h264,strictMime),
  {code:"basic-match",canEnableStrict:true,explicitRequest:true});
assert.deepEqual(probeDecision(h264,"video/mp4"),
  {code:"basic-match",canEnableStrict:false,explicitRequest:false},
  "Generic MP4 can be H264 but does not mean a strict codec request is available");
assert.deepEqual(probeDecision(vp9,strictMime),
  {code:"not-recommended",canEnableStrict:false,explicitRequest:true},
  "Even a claimed H264/AAC MIME MUST fail if actual video/audio are VP9/Opus");
assert.equal(probeDecision(webm,"video/webm").code,"not-recommended");
assert.equal(probeDecision({container:"MP4",video:[],audio:[],incomplete:true},strictMime).code,"unverified");
assert.equal(probeDecision({container:"MP4",video:["hvc1"],audio:["mp4a"],incomplete:false},strictMime).code,"not-recommended",
  "HEVC is not H264 and cannot be recommended for strict H264");
assert.equal(probeDecision(h264,"video/mp4;codecs=avc1,mp4a.40.2").canEnableStrict,true);
assert.equal(probeDecision(h264,"video/mp4;codecs=avc1.42E01E,mp4a.40.2").canEnableStrict,true);
assert.equal(probeDecision(h264,"video/mp4;codecs=avc1.424028,mp4a.40.2").canEnableStrict,true);
assert.equal(probeDecision(h264,"video/mp4;codecs=hvc1,mp4a.40.2").canEnableStrict,false);

const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
for(const id of ["edit-check-export","edit-check-status","edit-export-fallback","edit-check-codec","edit-check-use-strict"])
 assert.ok(html.includes('id="'+id+'"'),"Missing export diagnostic control "+id);
assert.ok(html.includes('src="./export-check.js"'),"missing test script");
assert.ok(sw.includes('"./export-check.js"'),"export test must load offline");
const probeSrc=fs.readFileSync("export-check.js","utf8");
assert.ok(probeSrc.includes("root.CutNovaCodecAudit")&&probeSrc.includes("audit.inspect(blob)"));
assert.ok(probeSrc.includes("strictToggle.dispatchEvent(new Event("),"Strict setting only on explicit click");
assert.ok(!probeSrc.includes("fetch(")&&!probeSrc.includes("getUserMedia("),"No remote network/mic");
assert.ok(probeSrc.includes("No media was uploaded."));
console.log("PASS: export probe privacy, safe unsupported reasons, and iPhone offline shell controls.");
