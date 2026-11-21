/* CutNova Results DOM regression: auto-inspect real owner ZIP, never invent downloads. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","jobs.js"),"utf8");
const ID="550e8400-e29b-41d4-a716-446655440000";

function makeNode(tag="div"){
  const node={
    tagName:tag.toUpperCase(),children:[],hidden:false,disabled:false,
    textContent:"",href:"",listeners:{},classes:new Set(),
    classList:{add(cls){node.classes.add(cls)}},
    append(...items){node.children.push(...items)},
    replaceChildren(...items){node.children=[...items];node.textContent="";},
    addEventListener(event,listener){node.listeners[event]=listener;},
    setAttribute(){},
  };
  return node;
}
function descendants(node){
  if(!node)return [];
  return [node,...(node.children||[]).flatMap(descendants)];
}
async function scenario({tracked=true,conclusion="success",artifacts=[]}={}){
  const list=makeNode(),status=makeNode(),refresh=makeNode();
  const elements={"job-results":list,"job-status":status,"refresh-jobs":refresh};
  const urls=[];
  const run={id:44942618474,status:"completed",conclusion,created_at:"2026-11-21T19:45:18Z",
    run_number:3,event:"workflow_dispatch",display_title:"CutNova owner "+ID};
  const ctx={
    document:{
      visibilityState:"visible",
      getElementById:id=>elements[id]||null,
      createElement:tag=>makeNode(tag),
      addEventListener(){},
    },
    window:{addEventListener(){}},
    location:{hash:"#render-history"},
    sessionStorage:{getItem:k=>(tracked&&k==="cutnova-latest-request-id")?ID:null},
    navigator:{onLine:true},
    fetch:async url=>{
      urls.push(url);
      let json;
      if(url.includes("/actions/workflows/"))json={workflow_runs:url.includes("/shorts.yml")?[run]:[]};
      else if(url.includes("/actions/runs/44942618474/artifacts"))json={artifacts};
      else throw Error("Unexpected URL "+url);
      return {ok:true,json:async()=>json};
    },
    AbortController,clearTimeout,setTimeout,Date,console
  };
  vm.runInNewContext(source,ctx);
  await new Promise(r=>setTimeout(r,30));
  return {list,status,urls,nodes:descendants(list)};
}
async function main(){
  const valid={id:14722321472,name:"cutnova-shorts-3",size_in_bytes:9218656,expired:false,
    expires_at:new Date(Date.now()+2*24*3600000).toISOString()};
  const a=await scenario({artifacts:[valid]});
  assert.match(a.status.textContent,/YOUR RENDER: SUCCESS/);
  assert.equal(a.urls.filter(u=>u.includes("/artifacts")).length,1);
  const dl=a.nodes.find(n=>n.tagName==="A"&&n.href.endsWith("/artifacts/14722321472"));
  assert.ok(dl,"Expected exactly the real GitHub artifact link for the owner render");
  assert.match(dl.textContent,/Open rendered files ZIP/);
  assert.match(a.nodes.map(n=>n.textContent).join(" "),/9\.22 MB/);
  assert.equal(a.nodes.some(n=>n.textContent.includes("Expires within 24 hours")),false);
  assert.equal(a.urls.some(u=>/owner-key|github-token|\/render$/i.test(u)),false);
  const near=await scenario({artifacts:[{...valid,expires_at:new Date(Date.now()+3600000).toISOString()}]});
  assert.equal(near.nodes.some(n=>n.textContent.includes("Expires within 24 hours")),true);
  const none=await scenario({artifacts:[]});
  assert.equal(none.nodes.some(n=>n.tagName==="A"&&n.href.includes("/artifacts/")),false);
  assert.match(none.nodes.map(n=>n.textContent).join(" "),/no downloadable artifacts/);
  const gone=await scenario({artifacts:[{...valid,expired:true}]});
  assert.equal(gone.nodes.some(n=>n.tagName==="A"&&n.href.includes("/artifacts/")),false);
  const fail=await scenario({conclusion:"failure",artifacts:[valid]});
  assert.equal(fail.urls.filter(u=>u.includes("/artifacts")).length,0,"Failure must not auto-promise media");
  const untracked=await scenario({tracked:false,artifacts:[valid]});
  assert.equal(untracked.urls.filter(u=>u.includes("/artifacts")).length,0,"Untracked public jobs should not auto-fetch archives");
  console.log("PASS: real owner ZIP auto-inspected; expiry warning; no fake, expired, failed or untracked auto-download links.");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
