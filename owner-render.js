/* CutNova owner-only GitHub renderer bridge. The owner key is never persisted. */
(function(){
  "use strict";
  const API="https://cutnova-render-api.addachai03.workers.dev";
  const byId=id=>document.getElementById(id);
  const health=byId("secure-render-health"),key=byId("secure-render-key");
  const start=byId("secure-render-start"),status=byId("secure-render-status");
  const refresh=byId("secure-render-refresh");
  if(!health||!key||!start||!status)return;
  let configured=false,busy=false;
  const say=s=>{status.textContent=s};
  async function check(){
    health.textContent="Checking owner-only gateway…";
    configured=false;
    key.disabled=true;start.disabled=true;
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
    key.disabled=!configured;start.disabled=!configured;
  }
  refresh?.addEventListener("click",()=>{if(!busy)check()});
  start.addEventListener("click",async()=>{
    if(!configured||busy){say("Secure backend is unavailable or a render request is in progress.");return}
    const url=byId("video-url")?.value.trim()||"",rights=byId("rights-confirm")?.checked===true;
    if(!rights){say("Please confirm you own or have permission to edit and republish this video.");return}
    if(!/^https:\/\//i.test(url)){say("Paste a full public HTTPS source video URL first.");return}
    const ownerKey=key.value;
    if(ownerKey.length<24){say("Enter your configured owner access key. Never paste your GitHub token here.");return}
    busy=true;start.disabled=true;say("Submitting an authenticated render request to the secure backend…");
    const payload={url,rights_confirm:true,clips:byId("clips-count")?.value,min_seconds:byId("min-seconds")?.value,max_seconds:byId("max-seconds")?.value,
      style:byId("highlight-style")?.value,language:byId("speech-language")?.value,crop:byId("smart-crop")?.value,
      caption_script:byId("caption-script")?.value,caption_style:byId("caption-style")?.value,pacing:byId("pacing")?.value};
    try{
      const response=await fetch(API+"/render",{method:"POST",mode:"cors",credentials:"omit",
        headers:{"Content-Type":"application/json","X-CutNova-Owner-Key":ownerKey},body:JSON.stringify(payload)});
      let data={};try{data=await response.json()}catch(_){}
      key.value="";
      if(!response.ok||data.accepted!==true)throw Error(data.error||"Render backend refused the request (HTTP "+response.status+").");
      say("Request accepted by GitHub. This is not a finished Short yet. Open RESULTS in CutNova to check the actual run and its downloadable files. Social platforms can still block access.");
      location.hash="#render-history";
    }catch(error){
      key.value="";
      say("Remote render not started: "+(error.message||"Network error")+". No fake results were created.");
    }finally{busy=false;start.disabled=!configured;}
  });
  check();
})();
