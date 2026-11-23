/* CutNova V4.7: on-device sampled visual-change suggestions for a user's local video.
 * Never reads a remote URL, uploads source media, downloads social streams,
 * pretends to use ASR/AI, or auto-exports/post clips.
 */
(function(root){
  "use strict";
  const MAX_FILE_BYTES=500*1024*1024, MAX_SCAN_SECONDS=12*60, MAX_SAMPLES=46;
  function frameDifference(a,b){
    if(!a||!b||a.length!==b.length||a.length<4||a.length%4)return 0;
    let total=0, valid=0;
    // Sample every fourth pixel; brightness/scene-change approximation only.
    for(let i=0;i<a.length;i+=16){
      total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
      valid+=3;
    }
    return valid?Math.min(1,total/(255*valid)):0;
  }
  function planSampleTimes(duration){
    if(!Number.isFinite(duration)||duration<1)return [];
    const scanned=Math.min(duration,MAX_SCAN_SECONDS);
    const count=Math.min(MAX_SAMPLES,Math.max(12,Math.ceil(scanned/12)));
    const end=Math.max(0,scanned-0.15);
    return Array.from({length:count},(_,i)=>Number((end*i/(count-1)).toFixed(2)));
  }
  function candidateWindows(samples,duration,requested=3,length=30){
    if(!Number.isFinite(duration)||duration<1||!Array.isArray(samples))return [];
    const clipLength=Math.min(duration,Math.max(15,Math.min(60,Number(length)||30)));
    const wanted=Math.min(6,Math.max(1,Math.trunc(Number(requested)||3)));
    const unique=new Map();
    for(const s of samples){
      if(!s||!Number.isFinite(s.time)||!Number.isFinite(s.delta)||
         s.time<0||s.time>duration||s.delta<0.025||s.delta>1)continue;
      const start=Math.max(0,Math.min(duration-clipLength,s.time-clipLength/2));
      const end=start+clipLength;
      const key=start.toFixed(2);
      if(!unique.has(key)||unique.get(key).delta<s.delta)
        unique.set(key,{start:Number(start.toFixed(2)),end:Number(end.toFixed(2)),time:s.time,delta:s.delta});
    }
    const ranked=Array.from(unique.values()).sort((a,b)=>b.delta-a.delta||a.start-b.start);
    if(!ranked.length)return [];
    const max=ranked[0].delta, chosen=[];
    for(const s of ranked){
      if(chosen.some(c=>s.start<c.end-0.03&&s.end>c.start+0.03))continue;
      chosen.push({
        start:s.start,end:s.end,
        score:Math.max(1,Math.min(100,Math.round(s.delta/max*100))),
        signal:"Sampled visual change (not speech or excitement)",
      });
      if(chosen.length===wanted)break;
    }
    return chosen;
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={frameDifference,planSampleTimes,candidateWindows,MAX_SCAN_SECONDS,MAX_SAMPLES};
    return;
  }
  if(!root?.document)return;
  const doc=root.document,by=id=>doc.getElementById(id);
  const fileInput=by("quick-file"),rights=by("quick-rights"),scan=by("visual-scan"),
    stop=by("visual-stop"),status=by("visual-status"),results=by("visual-results"),
    desired=by("visual-count"),length=by("visual-length");
  if(!fileInput||!rights||!scan||!stop||!status||!results)return;
  let aborter=null,session=0;
  function message(text){status.textContent=text;}
  function render(candidates,source,scanned,duration){
    results.replaceChildren();results.hidden=false;
    const explain=doc.createElement("p");explain.className="footnote";
    explain.textContent="Sampled first "+Math.round(scanned)+"s of "+Math.round(duration)+"s. "+
      "Results rank visual differences between sparse frames; they do not verify dialogue, gameplay, humor or exact cut boundaries. Review before exporting.";
    results.append(explain);
    candidates.forEach((c,index)=>{
      const card=doc.createElement("div");card.className="quick-cut";
      const info=doc.createElement("div"),title=doc.createElement("strong"),detail=doc.createElement("small");
      title.textContent="VISUAL PICK "+String(index+1).padStart(2,"0");
      detail.textContent=c.start.toFixed(1)+"–"+c.end.toFixed(1)+"s · relative visual-change score "+c.score+"/100";
      info.append(title,detail);
      const button=doc.createElement("button");button.type="button";button.className="btn btn-lime";
      button.textContent="REVIEW IN EDITOR";
      button.addEventListener("click",()=>{
        if(!rights.checked){
          message("Reconfirm that you own or may edit this video before opening the clip.");return;
        }
        const evt=new CustomEvent("cutnova:open-cut",{detail:{file:source,start:c.start,end:c.end}});
        root.dispatchEvent(evt);
        root.location.hash="#local-editor";
      });
      card.append(info,button);results.append(card);
    });
  }
  function eventOrTimeout(target,success,signal,ms){
    return new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(Error("Scan cancelled."));
      let finished=false;
      const timer=root.setTimeout(()=>finish(Error("iPhone video decode/seek timed out.")),ms);
      function finish(err){
        if(finished)return;finished=true;root.clearTimeout(timer);
        target.removeEventListener(success,good);target.removeEventListener("error",bad);
        signal.removeEventListener("abort",cancel);
        err?reject(err):resolve();
      }
      function good(){finish();}
      function bad(){finish(Error("This browser could not decode the local video."));}
      function cancel(){finish(Error("Scan cancelled."));}
      target.addEventListener(success,good,{once:true});
      target.addEventListener("error",bad,{once:true});
      signal.addEventListener("abort",cancel,{once:true});
    });
  }
  async function scanFile(source,signal,job){
    if(!source||source.size<1024||source.size>MAX_FILE_BYTES)
      throw Error("Choose your own video between 1 KiB and 500 MB.");
    if(!/^video\//i.test(source.type||"")&&!/\.(mp4|mov|m4v|webm)$/i.test(source.name||""))
      throw Error("Choose an MP4, MOV or WebM file.");
    const objectURL=URL.createObjectURL(source),video=doc.createElement("video"),
      canvas=doc.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx){URL.revokeObjectURL(objectURL);throw Error("Canvas sampling unsupported on this device.");}
    canvas.width=64;canvas.height=36;
    video.muted=true;video.playsInline=true;video.preload="auto";
    let last=null;const differences=[];
    try{
      const ready=eventOrTimeout(video,"loadedmetadata",signal,20000);
      video.src=objectURL;video.load();await ready;
      const duration=Number(video.duration);
      if(!Number.isFinite(duration)||duration<15)throw Error("Video must be at least 15 seconds for visual suggestions.");
      const times=planSampleTimes(duration);
      const scanned=Math.min(duration,MAX_SCAN_SECONDS);
      for(let i=0;i<times.length;i++){
        if(signal.aborted||job!==session)throw Error("Scan cancelled.");
        const time=times[i];
        // Seek without playback or microphone access. Never retain decoded frames.
        if(Math.abs(video.currentTime-time)>0.025||video.readyState<2){
          const seeked=eventOrTimeout(video,"seeked",signal,6500);
          video.currentTime=time;await seeked;
        }
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const frame=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        if(last){
          const delta=frameDifference(frame,last);
          if(Number.isFinite(delta))differences.push({time:Math.max(0,(time+times[i-1])/2),delta});
        }
        last=new Uint8ClampedArray(frame);
        message("Checking local frames "+(i+1)+"/"+times.length+" — no upload…");
      }
      return {candidates:candidateWindows(differences,duration,desired.value,length.value),scanned,duration};
    }finally{
      video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(objectURL);
      last=null;differences.length=0;
    }
  }
  function cancel(clear=true){
    session++;
    if(aborter){aborter.abort();aborter=null;}
    scan.disabled=false;stop.disabled=true;
    if(clear){results.hidden=true;results.replaceChildren();message("Scan cancelled. No media was uploaded or exported.");}
  }
  scan.addEventListener("click",async()=>{
    if(aborter)return;
    if(!rights.checked){message("Confirm your editing rights in the checkbox above first.");return;}
    const source=fileInput.files?.[0];
    if(!source){message("Select a video in CHOOSE VIDEO FROM PHONE first.");return;}
    const job=++session,controller=new AbortController();
    aborter=controller;scan.disabled=true;stop.disabled=false;results.replaceChildren();results.hidden=true;
    message("Opening your video locally for sampled visual scan…");
    try{
      const result=await scanFile(source,controller.signal,job);
      if(controller.signal.aborted||session!==job)return;
      if(!result.candidates.length){
        message("No strong sampled visual changes found. This can happen with interviews or still scenes. Use PREPARE SHORTS ON PHONE for timed cuts.");
      }else{
        render(result.candidates,source,result.scanned,result.duration);
        message("Prepared "+result.candidates.length+" visual-change suggestion(s). Review each in the editor; no MP4 is created until you export.");
      }
    }catch(error){
      if(session===job)message("Visual scan stopped: "+String(error?.message||"Unsupported video").slice(0,180)+
        " Use timed cuts if this browser cannot seek the file.");
    }finally{
      if(session===job){aborter=null;scan.disabled=false;stop.disabled=true;}
    }
  });
  stop.addEventListener("click",()=>cancel());
  fileInput.addEventListener("change",()=>{cancel(false);results.hidden=true;results.replaceChildren();message("New video selected. Confirm rights and tap FIND VISUAL MOMENTS to scan.");});
  root.addEventListener("pagehide",()=>{if(aborter)cancel(false);});
})(typeof window!=="undefined"?window:null);
