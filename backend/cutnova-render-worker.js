// CutNova owner-only render gateway. Never put GitHub credentials in this source.
const ORIGIN = "https://addachai03-stack.github.io";
const REPO = "addachai03-stack/index.html-";
const RUNS = "https://github.com/" + REPO + "/actions/workflows/shorts.yml";
const JSON_HEADERS = {"content-type":"application/json; charset=utf-8", "cache-control":"no-store","x-content-type-options":"nosniff"};
function reply(body,status=200,allowOrigin=false){
  return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...(allowOrigin?{"access-control-allow-origin":ORIGIN,"vary":"Origin"}:{})}});
}
async function equalSecret(a,b){
  if(typeof a!=="string"||typeof b!=="string"||b.length<24||a.length>256)return false;
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(a)),crypto.subtle.digest("SHA-256",enc.encode(b))]);
  const xa=new Uint8Array(x),ya=new Uint8Array(y);let diff=0;
  for(let i=0;i<xa.length;i++)diff|=xa[i]^ya[i];
  return diff===0;
}
function validSource(raw){
  if(typeof raw!=="string"||raw.length>2000||/[\u0000-\u001f\u007f]/.test(raw))return false;
  let u;try{u=new URL(raw)}catch{return false}
  if(u.protocol!=="https:"||u.username||u.password||u.port||!u.hostname)return false;
  const host=u.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||!host.includes(".")||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(":"))return false;
  for(const k of u.searchParams.keys()){
    if(/^(?:token|password|auth|authorization|api_key|signature|sig|credential|expires|key)$/i.test(k)||/^(x-amz-|x-goog-)/i.test(k))return false;
  }
  const social=["youtube.com","youtu.be","youtube-nocookie.com","instagram.com","instagr.am","facebook.com","fb.watch","fb.com","vimeo.com","tiktok.com","dailymotion.com","dai.ly","twitter.com","x.com","archive.org"];
  return social.some(s=>host===s||host.endsWith("."+s))||/\.(mp4|mov|m4v|webm)$/i.test(u.pathname)|| (host==="github.com"&&/^\/user-attachments\/assets\/[a-f0-9-]{36}\/?$/i.test(u.pathname));
}
const allowed=(v,options)=>options.includes(String(v));
export default {
  async fetch(request,env){
    const u=new URL(request.url),origin=request.headers.get("Origin");
    if(u.pathname==="/health"&&request.method==="GET")return reply({service:"CutNova render bridge",status:"online",configured:!!(env.CUTNOVA_GITHUB_TOKEN&&env.CUTNOVA_OWNER_KEY),mode:"owner-only"},200,origin===ORIGIN);
    if(u.pathname!=="/render"&&u.pathname!=="/verify")return reply({error:"Not found"},404);
    if(origin!==ORIGIN)return reply({error:"This endpoint is only used by CutNova."},403);
    if(request.method==="OPTIONS"){
      return new Response(null,{status:204,headers:{"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, x-cutnova-owner-key","access-control-max-age":"600","vary":"Origin"}});
    }
    if(request.method!=="POST")return reply({error:"Method not allowed"},405,true);
    if(!env.CUTNOVA_GITHUB_TOKEN||!env.CUTNOVA_OWNER_KEY)return reply({error:"Owner rendering not configured. GitHub token and owner key must be stored as Cloudflare Worker secrets."},503,true);
    if(!(await equalSecret(request.headers.get("x-cutnova-owner-key"),env.CUTNOVA_OWNER_KEY)))return reply({error:"Owner key not accepted."},401,true);
    if(u.pathname==="/verify"){
      // Read-only check: never dispatch an Action, access files, or reveal credentials.
      try{
        const r=await fetch("https://api.github.com/repos/"+REPO+"/actions/workflows/shorts.yml",{
          method:"GET",
          headers:{"Authorization":"Bearer "+env.CUTNOVA_GITHUB_TOKEN,
            "Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",
            "User-Agent":"CutNova-owner-verify"}
        });
        if(r.status===401||r.status===403)return reply({verified:false,error:"GitHub credential rejected or lacks access. Check token expiry and Actions permissions."},502,true);
        if(r.status===404)return reply({verified:false,error:"GitHub Shorts workflow not found or not accessible with this token."},502,true);
        if(!r.ok)return reply({verified:false,error:"GitHub workflow check failed (HTTP "+r.status+"). No job was started."},502,true);
        let workflow={};try{workflow=await r.json()}catch{return reply({verified:false,error:"GitHub returned an invalid workflow response."},502,true)}
        if(workflow.path!==".github/workflows/shorts.yml"||workflow.state!=="active")
          return reply({verified:false,error:"GitHub workflow is missing or not active. No job was started."},502,true);
        return reply({verified:true,owner_key_accepted:true,github_workflow_reachable:true,
          no_render_started:true,message:"Owner key accepted. GitHub workflow is active and reachable. This did not start or prove a video render."},200,true);
      }catch{return reply({verified:false,error:"GitHub workflow could not be reached. No render started."},502,true)}
    }
    if(Number(request.headers.get("content-length")||0)>6000)return reply({error:"Request too large."},413,true);
    let v;try{v=await request.json()}catch{return reply({error:"Invalid JSON request."},400,true)}
    if(!v||typeof v!=="object"||!validSource(v.url)||v.rights_confirm!==true)return reply({error:"Use a public authorized video HTTPS link and confirm editing rights."},400,true);
    // Allow any integer clip count 1–10 and exact/ranged seconds 15–60.
    // Never coerce partial numerals, decimals or 0 into a valid request.
    const clips=String(v.clips??"3"),min=String(v.min_seconds??"30"),max=String(v.max_seconds??"30");
    const integer=s=>/^\d{1,2}$/.test(s);
    if(!integer(clips)||!integer(min)||!integer(max)||
       Number(clips)<1||Number(clips)>10||
       Number(min)<15||Number(max)>60||Number(min)>Number(max)){
      return reply({error:"Use 1–10 clips and integer min/max seconds from 15–60. Set both to 30 for exact 30-second clips."},400,true);
    }
    const trackingId=typeof v.request_id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.request_id)
      ?v.request_id.toLowerCase():"manual";
    if(v.request_id!==undefined&&trackingId==="manual")
      return reply({error:"Invalid render tracking ID. No GitHub job was started."},400,true);
    const inputs={
      video_url:v.url,rights_confirm:"true",clips,min_seconds:min,max_seconds:max,request_id:trackingId,
      style:allowed(v.style,["engagement","funny","facts","story"])?v.style:"engagement",
      language:allowed(v.language,["auto","hi","en"])?v.language:"auto",
      crop:allowed(v.crop,["auto","center","track"])?v.crop:"auto",
      caption_script:allowed(v.caption_script,["original","roman"])?v.caption_script:"original",
      caption_style:allowed(v.caption_style,["classic","yellow","boxed","karaoke"])?v.caption_style:"classic",
      pacing:allowed(v.pacing,["original","tight"])?v.pacing:"original"
    };
    try {
      const r=await fetch("https://api.github.com/repos/"+REPO+"/actions/workflows/shorts.yml/dispatches",{
        method:"POST",
        headers:{"Authorization":"Bearer "+env.CUTNOVA_GITHUB_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json","User-Agent":"CutNova-owner-render"},
        body:JSON.stringify({ref:"main",inputs})
      });
      if(r.status===200||r.status===204){
        let result={};
        if(r.status===200){try{result=await r.json()}catch(_){ }}
        const runUrl=typeof result.html_url==="string"&&result.html_url.startsWith("https://github.com/"+REPO+"/actions/runs/")?result.html_url:RUNS;
        return reply({accepted:true,message:"GitHub accepted the owner render request. Processing can still fail if the source blocks downloading.",runs_url:runUrl,run_id:Number.isSafeInteger(result.workflow_run_id)?result.workflow_run_id:null,request_id:trackingId==="manual"?null:trackingId},202,true);
      }
      if(r.status===401||r.status===403)return reply({error:"GitHub rejected the server credential or workflow permission. Check the Cloudflare secret and GitHub Actions access."},502,true);
      return reply({error:"GitHub rejected the render request (HTTP "+r.status+"). Review owner workflow configuration."},502,true);
    }catch{return reply({error:"GitHub API unavailable. Try again later."},502,true)}
  }
};
