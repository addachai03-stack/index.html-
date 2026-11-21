const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const manifest=JSON.parse(fs.readFileSync("manifest.webmanifest"));
assert.equal(manifest.scope,"./");assert.equal(manifest.display,"standalone");
for(const icon of manifest.icons){
  const png=fs.readFileSync(icon.src),size=Number(icon.sizes.split("x")[0]);
  assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
}
assert.equal(fs.readFileSync("icons/apple-touch-icon.png").readUInt32BE(16),180);
const events={};
const context=vm.createContext({URL,Set,self:{location:{href:"https://example.github.io/cutnova/sw.js"},addEventListener:(name,fn)=>events[name]=fn}});
vm.runInContext(fs.readFileSync("sw.js","utf8"),context);
const check=(url,mode="navigate",method="GET")=>vm.runInContext("shellRequest("+JSON.stringify({url,mode,method})+")",context);
assert.equal(check("https://example.github.io/cutnova/?foo=1"),"https://example.github.io/cutnova/index.html");
assert.equal(check("https://example.github.io/cutnova/editor.js","cors"),"https://example.github.io/cutnova/editor.js");
for(const url of ["https://api.github.com/repos/x/y","https://example.github.io/cutnova/private.mp4","https://example.github.io/elsewhere/","blob:https://example.github.io/123"])assert.equal(check(url),null);
assert.equal(check("https://example.github.io/cutnova/","navigate","POST"),null);
assert.equal(check("https://example.github.io/cutnova/editor.js?x=1","cors"),null);
const shell=vm.runInContext("SHELL",context);
for(const path of shell){const root="https://example.github.io/cutnova/";const relative=path.slice(root.length);if(relative)assert.ok(fs.existsSync(relative),relative);}
assert.ok(events.install&&events.activate&&events.fetch);
console.log("PASS: scoped manifest and PNG icons, cache allowlist, navigation and private-media exclusion.");
