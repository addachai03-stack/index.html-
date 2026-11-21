/* CutNova owner-only GitHub renderer bridge. The owner key is never persisted. */
(function(){
  "use strict";
  const API="https://cutnova-render-api.addachai03.workers.dev";
  const byId=id=>document.getElementById(id);
  const health=byId("secure-render-health"),key=byId("secure-render-key");
  const start=byId("secure-render-start"),status=byId("secure-render-status");
  const refresh=byId("secure-render-refresh");
  const verify=byId("secure-render-verify"),verifyStatus=byId("secure-verify-status");
  const generate=byId("secure-key-generate"),copy=byId("secure-key-copy");
  const generated=byId("secure-key-output"),keyStatus=byId("secure-key-status");
  if(!health||!key||!start||!status)return;
  generate?.addEventListener("click",()=>{
    if(!generated||!copy||!keyStatus)return;
    if(generated.value&&!window.confirm("Replace the existing generated key? Save the current one in your password manager first."))return;
    if(!window.isSecureContext||!window.crypto||typeof window.crypto.getRandomValues!=="function"){
      keyStatus.textContent="Secure random generator unavailable. Open CutNova over HTTPS in Safari.";return;
    }
    const bytes=new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    generated.value=Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
    bytes.fill(0);
    copy.disabled=false;
    keyStatus.textContent="Strong private key generated locally. Copy it to a password manager, then save it as CUTNOVA_OWNER_KEY in Cloudflare. It is not saved by CutNova.";
  });
  copy?.addEventListener("click",async()=>{
    if(!generated?.value||!keyStatus)return;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(generated.value);
      else{
        generated.focus();generated.select();
        if(!document.execCommand("copy"))throw Error("Clipboard unavailable");
      }
      keyStatus.textContent="Key copied. Store it in a password manager, paste it into the Cloudflare CUTNOVA_OWNER_KEY secret, then use it in CutNova after setup. Do not share it in chat.";
    }catch(_){
      generated.focus();generated.select();
      keyStatus.textContent="Automatic copy unavailable. The generated key is selected; use iPhone Copy, and save it privately.";
    }
  });
  function newTrackingId(){
    const secure=window.crypto;
    if(secure?.randomUUID)return secure.randomUUID();
    if(!secure?.getRandomValues)return null;
    const bytes=new Uint8Array(16);secure.getRandomValues(bytes);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
    bytes.fill(0);
    return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
  }
  let configured=false,busy=false;
  const say=s=>{status.textContent=s};
  async function check(){
    health.textContent="Checking owner-only gateway…";
    configured=false;
    key.disabled=true;start.disabled=true;if(verify)verify.disabled=true;
    if(navigator.onLine===false){
      key.value="";
      health.textContent="Offline — cloud AI is unavailable. Local drafts and editing can work offline; reconnect and tap RECHECK OWNER BACKEND.";
      return;
    }
    try{
      const response=await fetch(API+"/health",{method:"GET",cache:"no-store",credentials:"omit"});
      if(!response.ok)throw Error("Gateway HTTP "+response.status);
      const data=await response.json();
      configured=data.service==="CutNova render bridge"&&data.configured===true;
      health.textContent=configured
        ?"Secure backend ready. Enter your private owner key to start a GitHub AI render; processing may still fail if the video platform blocks access."
        :"Backend deployed but locked: GitHub token and owner access key have not both been configured as Cloudflare Worker secrets. No remote render can start yet.";
    }catch(error){
      health.textContent="Owner backend is not reachable from this browser ("+(error.message||"network/CORS error")+"). Remote rendering disabled; local editing is still available.";
    }
    if(!configured)key.value="";
    key.disabled=!configured;start.disabled=!configured;if(verify)verify.disabled=!configured;
  }
  refresh?.addEventListener("click",()=>{if(!busy)check()});
  verify?.addEventListener("click",async()=>{
    if(!configured||busy){if(verifyStatus)verifyStatus.textContent="Backend unavailable or another request is running.";return;}
    const ownerKey=key.value;
    if(ownerKey.length<24){
      if(verifyStatus)verifyStatus.textContent="Paste your saved Owner Access Key above first. Do not enter a GitHub token.";
      return;
    }
    busy=true;verify.disabled=true;start.disabled=true;
    if(verifyStatus)verifyStatus.textContent="Checking owner key and GitHub workflow (read-only)…";
    try{
      const response=await fetch(API+"/verify",{
        method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
        headers:{"X-CutNova-Owner-Key":ownerKey}
      });
      let data={};try{data=await response.json()}catch(_){}
      if(!response.ok||data.verified!==true||data.no_render_started!==true)
        throw Error(data.error||"Owner verification failed (HTTP "+response.status+").");
      if(verifyStatus)verifyStatus.textContent="✓ OWNER VERIFIED — GitHub workflow is active and reachable. No video was started. Key cleared from this page; paste it again only when starting a real render.";
    }catch(error){
      if(verifyStatus)verifyStatus.textContent="Verification failed: "+(error.message||"Network error")+". No render started. Check your key and token setup.";
    }finally{
      key.value="";busy=false;verify.disabled=!configured;start.disabled=!configured;
    }
  });
  start.addEventListener("click",async()=>{
    if(!configured||busy){say("Secure backend is unavailable or a render request is in progress.");return}
    const url=byId("video-url")?.value.trim()||"",rights=byId("rights-confirm")?.checked===true;
    if(!rights){
      say("AI render not started. Tick the URL form's rights checkbox directly below PASTE LONG VIDEO LINK (not the Phone Backup checkbox). Only do this for permitted footage.");
      const checkbox=byId("rights-confirm");
      checkbox?.focus({preventScroll:true});
      checkbox?.scrollIntoView({block:"center",behavior:"smooth"});
      return;
    }
    if(!/^https:\/\//i.test(url)){say("Paste a full public HTTPS source video URL first.");return}
    const clips=Number(byId("clips-count")?.value),min=Number(byId("min-seconds")?.value),max=Number(byId("max-seconds")?.value);
    if(!Number.isInteger(clips)||clips<1||clips>10||!Number.isInteger(min)||!Number.isInteger(max)||min<15||max>60||min>max){
      say("Choose 1–10 clips and min/max seconds between 15–60. Set both to 30 to request exact 30-second clips.");return;
    }
    const ownerKey=key.value;
    if(ownerKey.length<24){say("Enter your configured owner access key. Never paste your GitHub token here.");return}
    busy=true;start.disabled=true;if(verify)verify.disabled=true;say("Submitting an authenticated render request to the secure backend…");
    const requestId=newTrackingId();
    const payload={url,rights_confirm:true,clips:byId("clips-count")?.value,min_seconds:byId("min-seconds")?.value,max_seconds:byId("max-seconds")?.value,
      style:byId("highlight-style")?.value,language:byId("speech-language")?.value,crop:byId("smart-crop")?.value,
      caption_script:byId("caption-script")?.value,caption_style:byId("caption-style")?.value,pacing:byId("pacing")?.value};
    if(requestId)payload.request_id=requestId;
    try{
      const response=await fetch(API+"/render",{method:"POST",mode:"cors",credentials:"omit",
        headers:{"Content-Type":"application/json","X-CutNova-Owner-Key":ownerKey},body:JSON.stringify(payload)});
      let data={};try{data=await response.json()}catch(_){}
      key.value="";
      if(!response.ok||data.accepted!==true)throw Error(data.error||"Render backend refused the request (HTTP "+response.status+").");
      if(requestId && data.request_id===requestId){
        try{sessionStorage.setItem("cutnova-latest-request-id",requestId)}catch(_){}
      }
      say("GitHub accepted a request for "+clips+" clips ("+min+"–"+max+" sec). RESULTS will identify your request once GitHub publishes its run record. This does NOT mean the video or creator pack has finished. Source downloading may still fail.");
      // Do not imply a finished video; this only requests fresh public status.
      location.hash="#render-history";
    }catch(error){
      key.value="";
      say("Remote render not started: "+(error.message||"Network error")+". No fake results were created.");
    }finally{busy=false;start.disabled=!configured;if(verify)verify.disabled=!configured;}
  });
  check();
})();
