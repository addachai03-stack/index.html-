const assert=require("node:assert/strict");
const fs=require("node:fs");
const {boxes,codecsInMoov,inspect,classify,label,honorsStrictSocialRequest}=require("../social-codec-check.js");
function box(tag,...parts){
  const bytes=Buffer.concat(parts.map(p=>Buffer.from(p)));
  const b=Buffer.alloc(bytes.length+8);
  b.writeUInt32BE(b.length,0);
  b.write(tag,4,4,"ascii");bytes.copy(b,8);
  return b;
}
function track(handler,codec){
  const hdlr=box("hdlr",Buffer.from([0,0,0,0,0,0,0,0]),Buffer.from(handler,"ascii"));
  const sample=box(codec,Buffer.alloc(8));
  const header=Buffer.alloc(8);
  header.writeUInt32BE(1,4);
  const stsd=box("stsd",header,sample);
  return box("trak",box("mdia",hdlr,box("minf",box("stbl",stsd))));
}
function sampleFile(video="avc1",audio="mp4a",{moovAtEnd=false,mdatSize=32}={}){
  const ftyp=box("ftyp",Buffer.from("isom", "ascii"),Buffer.alloc(8));
  const moov=box("moov",track("vide",video),track("soun",audio));
  const mdat=box("mdat",Buffer.alloc(mdatSize));
  return new Blob(moovAtEnd?[ftyp,mdat,moov]:[ftyp,moov,mdat],{type:"video/mp4"});
}
(async()=>{
  const ordinary=await inspect(sampleFile());
  assert.deepEqual(ordinary,{container:"MP4",video:["avc1"],audio:["mp4a"],incomplete:false});
  assert.equal(classify(ordinary).code,"basic-match");
  assert.equal(honorsStrictSocialRequest(ordinary),true);
  assert.equal(honorsStrictSocialRequest({container:"MP4",video:["hvc1"],audio:["mp4a"],incomplete:false}),false,"Strict must require H264, not HEVC");
  assert.match(label(ordinary),/H.264/);
  assert.match(label(ordinary),/AAC/);
  const hevc=await inspect(sampleFile("hvc1","mp4a"));
  assert.equal(classify(hevc).code,"basic-match");
  const bad=await inspect(sampleFile("vp09","Opus"));
  assert.deepEqual(bad.video,["vp09"]);
  assert.deepEqual(bad.audio,["Opus"]);
  assert.equal(classify(bad).code,"not-recommended");
  assert.equal(honorsStrictSocialRequest(bad),false,"Browser can ignore explicit codecs; must reject VP9/Opus even in MP4");
  assert.match(label(bad),/VP9.*Opus/);
  const end=await inspect(sampleFile("vp09","Opus",{moovAtEnd:true,mdatSize:320*1024}));
  assert.equal(classify(end).code,"not-recommended","must skip mdat safely to parse moov-at-end");
  const unknown=await inspect(sampleFile("zzzz","qqqq"));
  assert.equal(classify(unknown).code,"unverified");
  const incomplete=await inspect(new Blob([box("ftyp",Buffer.from("isom")),box("mdat",Buffer.alloc(10))],{type:"video/mp4"}));
  assert.equal(incomplete.container,"MP4");
  assert.equal(classify(incomplete).code,"unverified");
  assert.equal(honorsStrictSocialRequest(incomplete),false);
  const webm=await inspect(new Blob([Uint8Array.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0,0,0,0,0])],{type:"video/mp4"}));
  assert.equal(webm.container,"WebM","must inspect actual magic, never trust MIME/extension");
  assert.equal(classify(webm).code,"not-recommended");
  assert.equal((await inspect(new Blob(["not a real video"]))).container,"unknown");
  const mp4=sampleFile("avc1","mp4a");
  const bytes=new Uint8Array(await mp4.arrayBuffer());
  assert.ok(boxes(bytes).some(x=>x.type==="moov"));
  const moov=boxes(bytes).find(x=>x.type==="moov");
  assert.equal(codecsInMoov(bytes.slice(moov.start-8,moov.end)).video[0],"avc1");
  const html=fs.readFileSync("index.html","utf8");
  const sw=fs.readFileSync("sw.js","utf8");
  for(const id of ["edit-social-status"])assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('src="./social-codec-check.js"'));
  assert.ok(sw.includes('"./social-codec-check.js"'));
  const src=fs.readFileSync("social-codec-check.js","utf8");
  assert.ok(!src.includes("fetch("),"codec audit must never fetch videos");
  assert.ok(src.includes("root.CutNovaCodecAudit=Object.freeze"),"Editor and short sample must share the actual MP4 parser");
  assert.ok(src.includes("cutnova:export-reset"),"new output must clear old verdict");
  console.log("PASS: real MP4 stsd video/audio entries, VP9+Opus warning, H264+AAC candidate, moov at end, WebM spoof, uncertain formats and offline shell.");
})().catch(e=>{console.error(e);process.exitCode=1});
