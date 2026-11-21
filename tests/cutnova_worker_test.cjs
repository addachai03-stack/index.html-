/* CutNova owner render gateway unit tests (Node.js 20+, no network or credentials). */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
const ORIGIN="https://addachai03-stack.github.io";
const ENDPOINT="https://cutnova-render-api.addachai03.workers.dev";
const KEY="cutnova-test-owner-key-0123456789-strong";
const source=fs.readFileSync(path.join(__dirname,"..","backend","cutnova-render-worker.js"),"utf8")
  .replace(/export default\s*\{/,"module.exports = {");
function build(upstream){
  const sandbox={exports:{}};
  const factory=new Function("module","Request","Response","URL","TextEncoder","crypto","fetch",source+"\nreturn module.exports;");
  return factory(sandbox,Request,Response,URL,TextEncoder,webcrypto,upstream);
}
function http(body,opts={}){
  return new Request(ENDPOINT+(opts.path||"/render"),{
    method:opts.method||"POST",
    headers:{Origin:opts.origin===undefined?ORIGIN:opts.origin,
      "content-type":"application/json",
      ...(opts.key?{"x-cutnova-owner-key":opts.key}:{})},
    ...((opts.method||"POST")==="GET"||(opts.method||"POST")==="OPTIONS"?{}:{body:JSON.stringify(body)})
  });
}
const env={CUTNOVA_GITHUB_TOKEN:"github-token-placeholder-no-real-token",CUTNOVA_OWNER_KEY:KEY};
const valid={url:"https://example.org/owned-video.mp4",rights_confirm:true,clips:"3",min_seconds:"15",max_seconds:"30",language:"hi"};
const nope=async()=>{throw Error("should not reach GitHub")};
test("Health is online but locked without server secrets",async()=>{
 const w=build(nope),r=await w.fetch(http(null,{method:"GET",path:"/health"}),{});
 assert.equal(r.status,200);assert.equal(r.headers.get("access-control-allow-origin"),ORIGIN);
 assert.deepEqual({...(await r.json())}.configured,false);
});
test("Wrong origin blocked before credentials",async()=>{
 const r=await build(nope).fetch(http(valid,{origin:"https://attacker.example",key:KEY}),env);
 assert.equal(r.status,403);
});
test("CORS preflight only permits CutNova site",async()=>{
 const r=await build(nope).fetch(http(null,{method:"OPTIONS"}),env);
 assert.equal(r.status,204);assert.equal(r.headers.get("access-control-allow-origin"),ORIGIN);
 assert.match(r.headers.get("access-control-allow-headers"),/x-cutnova-owner-key/);
});
test("Missing required secret locks render",async()=>{
 const r=await build(nope).fetch(http(valid,{key:KEY}),{});
 assert.equal(r.status,503);
});
test("Wrong owner secret blocks GitHub calls",async()=>{
 const r=await build(nope).fetch(http(valid,{key:"wrong-123456789123456789123456"}),env);
 assert.equal(r.status,401);
});
test("Invalid URL or unconfirmed rights never invokes GitHub",async()=>{
 const w=build(nope);
 for(const payload of [{...valid,rights_confirm:false},{...valid,url:"http://example.org/a.mp4"},{...valid,url:"https://localhost/a.mp4"},{...valid,url:"https://example.org/x.mp4?token=abc"}]){
  const r=await w.fetch(http(payload,{key:KEY}),env);assert.equal(r.status,400);
 }
});
test("Authorized owner dispatches workflow with 204 response",async()=>{
 let called=false;
 const upstream=async(url,options)=>{
  called=true;assert.match(url,/\/actions\/workflows\/shorts.yml\/dispatches$/);
  assert.equal(options.method,"POST");
  assert.equal(options.headers.Authorization,"Bearer "+env.CUTNOVA_GITHUB_TOKEN);
  const data=JSON.parse(options.body);assert.equal(data.ref,"main");
  assert.equal(data.inputs.video_url,valid.url);
  assert.equal(data.inputs.language,"hi");
  assert.equal(data.inputs.rights_confirm,"true");
  return new Response(null,{status:204});
 };
 const r=await build(upstream).fetch(http(valid,{key:KEY}),env);
 assert.equal(r.status,202);assert.equal((await r.json()).accepted,true);assert.equal(called,true);
});
test("GitHub 200 with run metadata is accepted as queued, not completed",async()=>{
 const run="https://github.com/addachai03-stack/index.html-/actions/runs/123";
 const r=await build(async()=>new Response(JSON.stringify({workflow_run_id:123,html_url:run}),{status:200})).fetch(http(valid,{key:KEY}),env);
 assert.equal(r.status,202);const obj=await r.json();
 assert.equal(obj.accepted,true);assert.equal(obj.runs_url,run);assert.equal(obj.run_id,123);
});
test("Rejected GitHub credential does not claim success",async()=>{
 const r=await build(async()=>new Response(null,{status:403})).fetch(http(valid,{key:KEY}),env);
 assert.equal(r.status,502);assert.equal((await r.json()).accepted,undefined);
});


test("Owner can select any integer clip count and exact 30s duration",async()=>{
 let sent;
 const upstream=async(_url,options)=>{
   sent=JSON.parse(options.body);
   return new Response(null,{status:204});
 };
 const w=build(upstream);
 const r=await w.fetch(http({...valid,clips:"2",min_seconds:"30",max_seconds:"30"},{key:KEY}),env);
 assert.equal(r.status,202);
 assert.equal(sent.inputs.clips,"2");
 assert.equal(sent.inputs.min_seconds,"30");
 assert.equal(sent.inputs.max_seconds,"30");
});
test("Reject non-integer out-of-range or contradictory lengths",async()=>{
 const w=build(nope);
 const cases=[
  {clips:"0"},{clips:"11"},{clips:"2.5"},{clips:"abc"},
  {min_seconds:"14"},{max_seconds:"61"},
  {min_seconds:"45",max_seconds:"30"},{min_seconds:"20.5"}
 ];
 for(const p of cases){
  const r=await w.fetch(http({...valid,...p},{key:KEY}),env);
  assert.equal(r.status,400);
 }
});
test("Known public social link can dispatch but is not a successful MP4",async()=>{
 const examples=[
  "https://www.youtube.com/watch?v=XD-6LDZzXJ0",
  "https://www.instagram.com/reel/ABCdEFgh123/",
  "https://x.com/example/status/123456789"
 ];
 for(const url of examples){
  const r=await build(async()=>new Response(null,{status:204})).fetch(http({...valid,url},{key:KEY}),env);
  assert.equal(r.status,202);
  assert.equal((await r.json()).accepted,true);
 }
});

test("Read-only owner verify checks active GitHub workflow without dispatch",async()=>{
 let calls=0;
 const upstream=async(url,opts)=>{
   calls++;assert.match(url,/\/actions\/workflows\/shorts.yml$/);
   assert.equal(opts.method,"GET");
   assert.equal(opts.headers.Authorization,"Bearer "+env.CUTNOVA_GITHUB_TOKEN);
   return new Response(JSON.stringify({path:".github/workflows/shorts.yml",state:"active"}),{status:200,headers:{"content-type":"application/json"}});
 };
 const w=build(upstream);
 const r=await w.fetch(http(null,{path:"/verify",key:KEY}),env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.verified,true);
 assert.equal(data.no_render_started,true);
 assert.equal(data.owner_key_accepted,true);
 assert.equal(data.github_workflow_reachable,true);
 assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(data),/github-token-placeholder-no-real-token/);
});
test("Read-only verify blocks wrong owner, origin and missing secrets",async()=>{
 const w=build(nope);
 assert.equal((await w.fetch(http(null,{path:"/verify",key:"wrong-owner-key-123456789-12345"}),env)).status,401);
 assert.equal((await w.fetch(http(null,{path:"/verify",key:KEY,origin:"https://attacker.example"}),env)).status,403);
 assert.equal((await w.fetch(http(null,{path:"/verify",key:KEY}),{})).status,503);
 assert.equal((await w.fetch(http(null,{path:"/verify",key:KEY,method:"GET"}),env)).status,405);
});
test("Read-only verify reports GitHub token problems without rendering",async()=>{
 for(const status of [401,403,404,500]){
   const w=build(async(_url,opts)=>{assert.equal(opts.method,"GET");return new Response(null,{status})});
   const r=await w.fetch(http(null,{path:"/verify",key:KEY}),env);
   assert.equal(r.status,502);
   const body=await r.json();
   assert.equal(body.verified,false);
   assert.equal(body.accepted,undefined);
 }
 const disabled=build(async()=>new Response(JSON.stringify({path:".github/workflows/shorts.yml",state:"disabled_manually"}),{status:200}));
 const result=await disabled.fetch(http(null,{path:"/verify",key:KEY}),env);
 assert.equal(result.status,502);
});
