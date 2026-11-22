const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {strictSupported,allowableLocalSource,fileNameFor}=require("../local-reencode.js");

const src=new Blob([new Uint8Array(2400)],{type:"video/mp4"});
const webm=new Blob([new Uint8Array(2400)],{type:"video/webm"});
const h264="video/mp4;codecs=avc1.42001f,mp4a.40.2";
const supports=(type)=>type===h264;
assert.equal(strictSupported({MediaRecorder:{isTypeSupported:supports}}),true);
assert.equal(strictSupported({MediaRecorder:{isTypeSupported:t=>t==="video/mp4"}}),false,
  "Generic MP4 cannot prove H.264/AAC");
assert.equal(strictSupported({MediaRecorder:{isTypeSupported:()=>false}}),false);
assert.equal(strictSupported({MediaRecorder:{isTypeSupported:()=>{throw Error("broken browser")}}}),false);
assert.equal(strictSupported({}),false);
assert.equal(allowableLocalSource(src),true);
assert.equal(allowableLocalSource(new Blob(["tiny"])),false);
assert.equal(allowableLocalSource(new Blob([new Uint8Array(2400)]),2000),false);
assert.equal(fileNameFor(src),"CutNova_Private_Reencode_Source.mp4");
assert.equal(fileNameFor(webm),"CutNova_Private_Reencode_Source.webm");

class DemoFile extends Blob{
  constructor(parts,name,options){super(parts,options);this.name=name;}
}
async function runScenario({supported=true,accepted=true,seconds=3.1}={}){
  const listeners={},controls={},events=[];
  function el(id){
    if(controls[id])return controls[id];
    const x={id,disabled:true,textContent:"",readyState:1,duration:seconds,
      handlers:{},addEventListener(type,fn){x.handlers[type]=fn;}};
    controls[id]=x;return x;
  }
  const root={
    MediaRecorder:{isTypeSupported:t=>supported&&t===h264},
    File:DemoFile,
    addEventListener(type,fn){listeners[type]=fn;},
    dispatchEvent(event){
      events.push(event);
      if(event.type==="cutnova:open-cut" && accepted){
        event.detail.accepted=true;
        listeners["cutnova:export-reset"]();
        listeners["cutnova:reencode-ready"]({detail:{strictSocial:true,duration:seconds}});
      }
    }
  };
  const CustomEvent=class{
    constructor(type,{detail}){this.type=type;this.detail=detail;}
  };
  vm.runInNewContext(fs.readFileSync("local-reencode.js","utf8"),{
    window:root,document:{getElementById:el},CustomEvent,Blob,console,setTimeout,clearTimeout
  });
  assert.equal(el("edit-reencode-local").disabled,true);
  listeners["cutnova:export-ready"]({detail:{blob:src}});
  if(supported){
    assert.equal(el("edit-reencode-local").disabled,false);
    await el("edit-reencode-local").handlers.click();
    assert.equal(events.length,1,"one click triggers exactly one local handoff");
    const info=events[0].detail;
    assert.equal(info.strictSocial,true);
    assert.equal(info.reencode,true);
    assert.equal(info.start,0);
    assert.equal(info.end,seconds);
    assert.ok(info.file instanceof DemoFile);
    assert.equal(info.file.size,src.size);
    if(accepted){
      assert.match(el("edit-reencode-status").textContent,/PRIVATE SOURCE LOADED/);
      assert.equal(el("edit-reencode-local").disabled,true,"old blob must not stay available");
    }else{
      assert.match(el("edit-reencode-status").textContent,/LOCAL RE-ENCODE CANCELLED/);
      assert.equal(el("edit-reencode-local").disabled,false);
    }
  }else{
    assert.equal(events.length,0);
    assert.equal(el("edit-reencode-local").disabled,true);
    assert.match(el("edit-reencode-status").textContent,/UNSUPPORTED/);
  }
}
(async()=>{
  await runScenario({supported:true,accepted:true});
  await runScenario({supported:true,accepted:false});
  await runScenario({supported:false});
  const html=fs.readFileSync("index.html","utf8");
  const sw=fs.readFileSync("sw.js","utf8");
  const js=fs.readFileSync("local-reencode.js","utf8");
  const editor=fs.readFileSync("editor.js","utf8");
  for(const id of ["edit-reencode-local","edit-reencode-status","edit-require-h264","edit-rights"])
    assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
  assert.ok(html.includes('src="./local-reencode.js"'));
  assert.ok(sw.includes('"./local-reencode.js"'));
  assert.ok(editor.includes("cut.strictSocial)requireSocial.checked=true"));
  assert.ok(editor.includes("rights.checked=false"));
  assert.ok(editor.includes('cutnova:reencode-ready'));
  assert.ok(!js.includes("fetch(") && !js.includes("XMLHttpRequest"),"No network allowed");
  assert.ok(!js.includes("localStorage") && !js.includes("sessionStorage"));
  assert.ok(!js.includes("navigator.share") && !js.includes("recorder.start"),
    "Never silently export or share");
  console.log("PASS: private Blob second-pass to real editor, strict codec request, no permission auto-accept, unsupported/cancel safety, no network.");
})().catch(e=>{console.error(e);process.exitCode=1;});
