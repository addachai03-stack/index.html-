const assert=require("node:assert/strict");
const fs=require("node:fs");
const {sameSize,equalMedia,playablePortrait,MAX_BYTES}=require("../saved-file-check.js");
(async()=>{
  const a=new Blob([Uint8Array.from({length:4*1024*1024+49},(_,i)=>i%251)]);
  const b=new Blob([Uint8Array.from({length:4*1024*1024+49},(_,i)=>i%251)]);
  const invalid=new Uint8Array(await a.arrayBuffer());invalid[invalid.length-2]^=1;
  const mutated=new Blob([invalid]);
  assert.equal(sameSize(a,b),true);
  assert.equal(sameSize(a,new Blob(["short"])),false);
  assert.equal(await equalMedia(a,b),true,"exact same bytes must match despite different Blob identity");
  assert.equal(await equalMedia(a,mutated),false,"same file size, different last block content must not match");
  assert.equal(await equalMedia(a,new Blob(["small"])),false);
  await assert.rejects(()=>equalMedia(new Blob([]),new Blob([])),/between 1 byte/);
  await assert.rejects(()=>equalMedia(a,b,0),/Invalid comparison block size/);
  assert.equal(playablePortrait({videoWidth:720,videoHeight:1280,duration:3}),true);
  assert.equal(playablePortrait({videoWidth:720,videoHeight:1280,duration:NaN}),false);
  assert.equal(playablePortrait({videoWidth:1280,videoHeight:720,duration:3}),false);
  const html=fs.readFileSync("index.html","utf8");
  const sw=fs.readFileSync("sw.js","utf8");
  const code=fs.readFileSync("saved-file-check.js","utf8");
  for(const id of ["edit-saved-file","edit-saved-preview","edit-saved-verify","edit-saved-status"])
    assert.ok(html.includes('id="'+id+'"'),"Missing UI "+id);
  assert.ok(html.includes('src="./saved-file-check.js"'),"Missing script");
  assert.ok(sw.includes('"./saved-file-check.js"'),"Missing offline shell");
  assert.ok(code.includes('currentHref.startsWith("blob:")'),"May only read current local export");
  assert.ok(!code.includes("fetch("),"File comparison must not fetch URLs");
  assert.ok(code.includes("originalBlob=event.detail?.blob"),"Must use actual recorder Blob");
  assert.ok(fs.readFileSync("editor.js","utf8").includes('new CustomEvent("cutnova:export-ready",{detail:{blob}})'),"Editor must supply its original exported Blob");

  assert.ok(code.includes("File contents match exactly"),"Must accurately describe bytes check progress");
  assert.equal(MAX_BYTES,512*1024*1024);
  console.log("PASS: saved iPhone file verification compares every byte (rejects same-size mutations), validates playback format, never accesses arbitrary URLs.");
})().catch(e=>{console.error(e);process.exitCode=1;});
