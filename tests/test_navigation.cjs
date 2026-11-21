const fs=require("fs"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("nav.js","utf8"),sw=fs.readFileSync("sw.js","utf8");
const tabs=["home","ai","editor","projects","results"];
for(const tab of tabs){assert.ok(html.includes('data-nav="'+tab+'"'),tab);assert.ok(js.includes('data-nav')); }
for(const id of ["studio","local-editor","render-history","project-manager","mobile-nav","mobile-preview","mobile-export"]){
  assert.ok(html.includes('id="'+id+'"'),id);
}
assert.ok(sw.includes('"./nav.js"'),"Navigation cached offline");
assert.ok(html.includes('src="./nav.js"'),"Navigation loaded");
assert.ok(js.includes("hashchange")&&js.includes("MutationObserver"));
console.log("PASS: mobile tabs, hash navigation, editor quick actions, offline navigation asset.");
