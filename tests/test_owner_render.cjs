/* Simulated iPhone owner UI checks, no network, no secrets and no real workflow dispatch. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"..","owner-render.js"),"utf8");
const events=new Map(),elements=new Map(),stored=new Map(),requests=[];
const ids=[
 "secure-render-health","secure-render-key","secure-render-start","secure-render-status",
 "secure-render-refresh","secure-render-verify","secure-verify-status",
 "secure-key-generate","secure-key-copy","secure-key-output","secure-key-status",
 "video-url","rights-confirm","clips-count","min-seconds","max-seconds",
 "highlight-style","speech-language","smart-crop","caption-script",
 "caption-style","pacing"
];
function el(id){
 if(!elements.has(id))elements.set(id,{
  value:"",checked:false,disabled:false,textContent:"",
  addEventListener:(type,fn)=>events.set(id+":"+type,fn),
  focus(){},select(){}
 });
 return elements.get(id);
}
ids.forEach(el);
el("video-url").value="https://remotion.media/video-1m.mp4";
el("rights-confirm").checked=true;
el("clips-count").value="2";
el("min-seconds").value="30";
el("max-seconds").value="30";
el("highlight-style").value="engagement";
el("speech-language").value="auto";
el("smart-crop").value="center";
el("caption-script").value="original";
el("caption-style").value="classic";
el("pacing").value="original";
const id="550e8400-e29b-41d4-a716-446655440000";
let allowedVerification=true;
const fetchMock=async(url,options={})=>{
 requests.push({url,options});
 if(url.endsWith("/health"))return new Response(JSON.stringify({service:"CutNova render bridge",configured:true}),{status:200});
 if(url.endsWith("/verify")){
  assert.equal(options.method,"POST");
  assert.equal(options.headers["X-CutNova-Owner-Key"],"test-private-owner-key-123456789");
  return new Response(JSON.stringify(allowedVerification
   ?{verified:true,owner_key_accepted:true,github_workflow_reachable:true,no_render_started:true}
   :{verified:false,error:"Owner key not accepted."}),{status:allowedVerification?200:401});
 }
 if(url.endsWith("/render")){
  assert.equal(options.method,"POST");
  const payload=JSON.parse(options.body);
  assert.equal(payload.request_id,id);
  assert.equal(payload.min_seconds,"30");
  assert.equal(payload.max_seconds,"30");
  assert.equal(payload.clips,"2");
  return new Response(JSON.stringify({accepted:true,request_id:id,runs_url:"https://github.com/addachai03-stack/index.html-/actions/workflows/shorts.yml"}),{status:202});
 }
 throw Error("Unexpected mocked URL "+url);
};
const location={hash:"#studio"};
const context={
 document:{getElementById:el,execCommand:() => true},
 window:{crypto:{randomUUID:()=>id},isSecureContext:true,confirm:()=>true},
 navigator:{clipboard:{writeText:async()=>{}}},
 sessionStorage:{setItem:(k,v)=>stored.set(k,v),getItem:k=>stored.get(k)},
 location,fetch:fetchMock,Uint8Array,Response,Array,console
};
async function run(){
 vm.runInNewContext(source,context);
 // Finish startup /health readiness read.
 await new Promise(setImmediate);
 assert.equal(el("secure-render-start").disabled,false);
 assert.equal(el("secure-render-verify").disabled,false);
 // Connection verification must not submit a render or persist credentials.
 el("secure-render-key").value="test-private-owner-key-123456789";
 await events.get("secure-render-verify:click")();
 assert.equal(requests.filter(x=>x.url.endsWith("/verify")).length,1);
 assert.equal(requests.filter(x=>x.url.endsWith("/render")).length,0);
 assert.equal(el("secure-render-key").value,"");
 assert.match(el("secure-verify-status").textContent,/OWNER VERIFIED/);
 assert.match(el("secure-verify-status").textContent,/No video was started/);
 assert.equal(stored.size,0);
 // A failed verification must never report verified.
 allowedVerification=false;
 el("secure-render-key").value="test-private-owner-key-123456789";
 await events.get("secure-render-verify:click")();
 assert.match(el("secure-verify-status").textContent,/Verification failed/);
 assert.equal(el("secure-render-key").value,"");
 assert.equal(requests.filter(x=>x.url.endsWith("/render")).length,0);
 // Offline iPhone app must not make cross-origin owner health calls.
 const countBeforeOffline=requests.length;
 context.navigator.onLine=false;
 el("secure-render-key").value="test-private-owner-key-123456789";
 events.get("secure-render-refresh:click")();
 await new Promise(setImmediate);
 assert.equal(requests.length,countBeforeOffline,"Offline check must make no network requests");
 assert.equal(el("secure-render-key").value,"");
 assert.match(el("secure-render-health").textContent,/Offline/);
 assert.equal(el("secure-render-start").disabled,true);
 context.navigator.onLine=true;
 events.get("secure-render-refresh:click")();
 await new Promise(setImmediate);
 assert.equal(el("secure-render-start").disabled,false,"Owner panel should recover after reconnect");
 // Explicit owner render submits the real settings in mocked context.
 el("secure-render-key").value="test-private-owner-key-123456789";
 await events.get("secure-render-start:click")();
 assert.equal(requests.filter(x=>x.url.endsWith("/render")).length,1);
 assert.equal(stored.get("cutnova-latest-request-id"),id);
 assert.equal(el("secure-render-key").value,"");
 assert.equal(location.hash,"#render-history");
 assert.match(el("secure-render-status").textContent,/does NOT mean the video/);
 console.log("PASS: owner /verify performs no render, clears key, handles refusal, and explicit /render stores only tracking ID.");
}
run().catch(e=>{console.error(e);process.exitCode=1});
