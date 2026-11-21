const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {exportFile,supportsShare}=require("../native-share.js");

class FakeFile extends Blob{
 constructor(parts,name,options){super(parts,options);this.name=name;}
}
const sample=new Blob([new Uint8Array(1500)],{type:"video/mp4"});
const file=exportFile(sample,"CutNova_Manual_Short.mp4",FakeFile);
assert.equal(file.name,"CutNova_Manual_Short.mp4");
assert.equal(file.type,"video/mp4");
assert.equal(file.size,sample.size);
assert.equal(supportsShare({share(){},canShare:({files})=>files[0]===file},file),true);
assert.equal(supportsShare({share(){},canShare:()=>false},file),false);
assert.equal(supportsShare({share(){}},file),false);
assert.equal(supportsShare({share(){},canShare:()=>{throw Error("blocked")}},file),false);
assert.throws(()=>exportFile(new Blob([1]),"out.mp4",FakeFile),/No valid exported video/);
assert.throws(()=>exportFile(sample,"out.exe",FakeFile),/Unknown output file type/);

const js=fs.readFileSync("native-share.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
assert.ok(html.includes('id="edit-share-file"'));
assert.ok(html.includes('id="edit-share-status"'));
assert.ok(sw.includes('"./native-share.js"'),"Cache local share controls offline");
assert.ok(js.includes('await root.navigator.share({files:[file]})'));
assert.ok(!js.includes("fetch("),"No background fetch needed for native sharing");

async function scenario({available=true,abort=false}={}){
 const handlers={};
 const elements={};
 function node(id){
   if(elements[id])return elements[id];
   const o={id,disabled:true,textContent:"",download:"CutNova_Manual_Short.mp4",attributes:{"href":"blob:cutnova-test"},
      addEventListener(name,cb){o.handlers[name]=cb;},
      getAttribute(key){return o.attributes[key]||null;},handlers:{}};
   elements[id]=o;return o;
 }
 let calls=0,lastFile=null;
 const nav={
   canShare:({files})=>available&&files?.length===1,
   share:async({files})=>{calls++;lastFile=files[0];if(abort){const error=new Error("user cancelled");error.name="AbortError";throw error;}}
 };
 const root={File:FakeFile,navigator:nav,addEventListener(name,cb){handlers[name]=cb;}};
 const ctx={window:root,document:{getElementById:node},Blob,File:FakeFile,console};
 vm.runInNewContext(js,ctx);
 assert.equal(node("edit-share-file").disabled,true);
 assert.equal(calls,0);
 handlers["cutnova:export-ready"]({detail:{blob:sample}});
 assert.equal(node("edit-share-file").disabled,false);
 await node("edit-share-file").handlers.click();
 return{elements,root,handlers,calls,lastFile};
}
(async()=>{
 let good=await scenario();
 assert.equal(good.calls,1,"User click should invoke share exactly once");
 assert.equal(good.lastFile.size,sample.size);
 assert.match(good.elements["edit-share-status"].textContent,/cannot confirm which destination/i);
 let no=await scenario({available:false});
 assert.equal(no.calls,0);
 assert.match(no.elements["edit-share-status"].textContent,/NATIVE FILE SHARE UNAVAILABLE/);
 let cancelled=await scenario({abort:true});
 assert.equal(cancelled.calls,1);
 assert.match(cancelled.elements["edit-share-status"].textContent,/SHARING CANCELLED/);
 cancelled.handlers["cutnova:export-reset"]();
 assert.equal(cancelled.elements["edit-share-file"].disabled,true);
 assert.match(cancelled.elements["edit-share-status"].textContent,/after exporting a Short/);
 console.log("PASS: native user-initiated file share, unavailable fallback, cancel and export-reset; no background upload or false Files save.");
})().catch(e=>{console.error(e);process.exitCode=1;});
