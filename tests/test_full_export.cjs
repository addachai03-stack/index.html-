const assert=require("node:assert/strict");
const fs=require("node:fs");
const {mediaSupport,originalDemoName}=require("../full-export-test.js");
assert.equal(mediaSupport({MediaRecorder:{isTypeSupported:m=>m==="video/mp4"}}),"video/mp4");
assert.equal(mediaSupport({MediaRecorder:{isTypeSupported:m=>m==="video/webm"}}),"video/webm");
assert.equal(mediaSupport({MediaRecorder:{isTypeSupported:()=>false}}),"");
assert.equal(mediaSupport(null),"");
assert.equal(originalDemoName("video/mp4"),"CutNova_Original_Test_Source.mp4");
assert.equal(originalDemoName("video/webm"),"CutNova_Original_Test_Source.webm");
const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
for(const id of ["edit-prepare-test","edit-prepare-status"]){
 assert.ok(html.includes('id="'+id+'"'),"Missing full export control "+id);
}
assert.ok(html.includes('src="./full-export-test.js"'));
assert.ok(sw.includes('"./full-export-test.js"'),"Full export demo should work offline");
const src=fs.readFileSync("full-export-test.js","utf8");
assert.match(src,/cutnova:open-cut/,"Must use real editor import bridge");
assert.match(src,/end:3/,"Must prepare 3-second output range");
assert.doesNotMatch(src,/\.checked\s*=\s*true/,"May not auto accept rights");
assert.doesNotMatch(src,/\/render[^-]/,"May not dispatch cloud render");
console.log("PASS: synthetic local demo uses real editor, three-second trim, explicit rights and no cloud upload.");
