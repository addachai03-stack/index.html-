const assert=require("node:assert/strict");
const fs=require("node:fs");
const {capabilities,unsupportedReason}=require("../export-check.js");
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
const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
for(const id of ["edit-check-export","edit-check-status","edit-export-fallback"])
 assert.ok(html.includes('id="'+id+'"'),"Missing export diagnostic control "+id);
assert.ok(html.includes('src="./export-check.js"'),"missing test script");
assert.ok(sw.includes('"./export-check.js"'),"export test must load offline");
assert.ok(fs.readFileSync("export-check.js","utf8").includes("No file was stored/uploaded."));
console.log("PASS: export probe privacy, safe unsupported reasons, and iPhone offline shell controls.");
